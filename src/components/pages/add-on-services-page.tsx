"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";
import {
  Package, Search, RefreshCw, Plus, CheckCircle2, XCircle, User,
  Clock, Tag, Star, Power,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

// ─── Types ────────────────────────────────────────────────────────
interface AddOnService {
  id: string;
  name: string;
  type: "SPEED_BOOST" | "DATA_TOPUP" | "STATIC_IP" | "PREMIUM_SUPPORT" | "CONTENT_PASS" | "CUSTOM";
  description: string;
  price: number;
  validityDays: number | null; // null = recurring
  validityLabel: string; // e.g., "30 days", "Monthly"
  status: "ACTIVE" | "INACTIVE";
  subscriptionCount: number;
  createdAt: string;
}

interface AddOnSubscription {
  id: string;
  subscriberId: string;
  subscriberName: string;
  subscriberCode: string;
  serviceId: string;
  serviceName: string;
  serviceType: string;
  subscribedAt: string;
  expiresAt: string | null;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  pricePaid: number;
  autoRenew: boolean;
}

interface ServiceFormData {
  name: string;
  type: string;
  description: string;
  price: number;
  validityDays: number;
  status: string;
}

const PAGE_SIZE = 15;

// ─── Component ────────────────────────────────────────────────────
export default function AddOnServicesPage() {
  const [services, setServices] = useState<AddOnService[]>([]);
  const [subscriptions, setSubscriptions] = useState<AddOnSubscription[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);

  // Services tab
  const [servicePage, setServicePage] = useState(1);
  const [serviceSearch, setServiceSearch] = useState("");
  const [addServiceDialogOpen, setAddServiceDialogOpen] = useState(false);
  const [editServiceDialogOpen, setEditServiceDialogOpen] = useState(false);
  const [serviceForm, setServiceForm] = useState<ServiceFormData>({
    name: "", type: "SPEED_BOOST", description: "", price: 0, validityDays: 30, status: "ACTIVE",
  });
  const [editingService, setEditingService] = useState<AddOnService | null>(null);
  const [serviceSaving, setServiceSaving] = useState(false);

  // Subscriptions tab
  const [subSearch, setSubSearch] = useState("");
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [selectedSubName, setSelectedSubName] = useState("");
  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const [subscribeServiceId, setSubscribeServiceId] = useState("");
  const [subscribeSaving, setSubscribeSaving] = useState(false);
  const [unsubscribeDialogOpen, setUnsubscribeDialogOpen] = useState(false);
  const [unsubscribingSub, setUnsubscribingSub] = useState<AddOnSubscription | null>(null);

  // ─── Data Fetching ───
  const fetchServices = useCallback(async () => {
    setLoadingServices(true);
    try {
      const data = await apiFetch<{ services: AddOnService[] }>("/api/add-on-services");
      setServices(data.services || []);
    } catch {
      toast.error("Failed to load add-on services");
    } finally {
      setLoadingServices(false);
    }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const fetchSubscriptions = useCallback(async (subId: string) => {
    setLoadingSubs(true);
    try {
      const data = await apiFetch<{ subscriptions: AddOnSubscription[] }>(
        `/api/add-on-services/subscriptions?subscriberId=${subId}`
      );
      setSubscriptions(data.subscriptions || []);
    } catch {
      toast.error("Failed to load subscriptions");
      setSubscriptions([]);
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  // ─── Filtering ───
  const filteredServices = services.filter(
    (s) =>
      !serviceSearch ||
      s.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
      s.type.toLowerCase().includes(serviceSearch.toLowerCase())
  );
  const totalServicePages = Math.ceil(filteredServices.length / PAGE_SIZE);
  const paginatedServices = filteredServices.slice((servicePage - 1) * PAGE_SIZE, servicePage * PAGE_SIZE);

  // ─── Service CRUD ───
  function openAddService() {
    setEditingService(null);
    setServiceForm({ name: "", type: "SPEED_BOOST", description: "", price: 0, validityDays: 30, status: "ACTIVE" });
    setAddServiceDialogOpen(true);
  }

  function openEditService(service: AddOnService) {
    setEditingService(service);
    setServiceForm({
      name: service.name,
      type: service.type,
      description: service.description,
      price: service.price,
      validityDays: service.validityDays || 0,
      status: service.status,
    });
    setEditServiceDialogOpen(true);
  }

  async function saveService(isEdit: boolean) {
    if (!serviceForm.name.trim() || serviceForm.price <= 0) {
      toast.error("Name and price are required");
      return;
    }
    setServiceSaving(true);
    try {
      if (isEdit && editingService) {
        await apiFetch(`/api/add-on-services/${editingService.id}`, {
          method: "PUT",
          body: JSON.stringify(serviceForm),
        });
        toast.success("Service updated");
      } else {
        await apiFetch("/api/add-on-services", {
          method: "POST",
          body: JSON.stringify(serviceForm),
        });
        toast.success("Service created");
      }
      setAddServiceDialogOpen(false);
      setEditServiceDialogOpen(false);
      fetchServices();
    } catch {
      toast.error("Failed to save service");
    } finally {
      setServiceSaving(false);
    }
  }

  // ─── Subscriber search ───
  async function searchSubscriber() {
    if (!subSearch.trim()) return;
    try {
      const data = await apiFetch<{ subscribers: { id: string; name: string; code: string }[] }>(
        `/api/subscribers?search=${encodeURIComponent(subSearch)}&limit=1`
      );
      if (data.subscribers && data.subscribers.length > 0) {
        const sub = data.subscribers[0];
        setSelectedSubId(sub.id);
        setSelectedSubName(`${sub.name} (${sub.code})`);
        fetchSubscriptions(sub.id);
      } else {
        toast.error("No subscriber found");
        setSelectedSubId(null);
        setSelectedSubName("");
        setSubscriptions([]);
      }
    } catch {
      toast.error("Failed to search subscriber");
    }
  }

  // ─── Subscribe / Unsubscribe ───
  function openSubscribe() {
    if (!selectedSubId) {
      toast.error("Search and select a subscriber first");
      return;
    }
    setSubscribeServiceId("");
    setSubscribeDialogOpen(true);
  }

  async function subscribe() {
    if (!subscribeServiceId) {
      toast.error("Select an add-on service");
      return;
    }
    setSubscribeSaving(true);
    try {
      await apiFetch("/api/add-on-services/subscribe", {
        method: "POST",
        body: JSON.stringify({ subscriberId: selectedSubId, serviceId: subscribeServiceId }),
      });
      toast.success("Subscribed successfully");
      setSubscribeDialogOpen(false);
      fetchSubscriptions(selectedSubId!);
      fetchServices(); // refresh counts
    } catch {
      toast.error("Failed to subscribe");
    } finally {
      setSubscribeSaving(false);
    }
  }

  async function unsubscribe() {
    if (!unsubscribingSub || !selectedSubId) return;
    try {
      await apiFetch(`/api/add-on-services/subscriptions/${unsubscribingSub.id}`, { method: "DELETE" });
      toast.success("Unsubscribed successfully");
      setUnsubscribeDialogOpen(false);
      setUnsubscribingSub(null);
      fetchSubscriptions(selectedSubId);
      fetchServices();
    } catch {
      toast.error("Failed to unsubscribe");
    }
  }

  // ─── Helpers ───
  function typeBadge(type: string) {
    const map: Record<string, { label: string; cls: string }> = {
      SPEED_BOOST: { label: "Speed Boost", cls: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
      DATA_TOPUP: { label: "Data Topup", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
      STATIC_IP: { label: "Static IP", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300" },
      PREMIUM_SUPPORT: { label: "Premium Support", cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
      CONTENT_PASS: { label: "Content Pass", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
      CUSTOM: { label: "Custom", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400" },
    };
    const entry = map[type] || { label: type, cls: "" };
    return <Badge className={`${entry.cls} text-[10px]`}>{entry.label}</Badge>;
  }

  function serviceStatusBadge(status: string) {
    return status === "ACTIVE" ? (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 text-[10px]">Active</Badge>
    ) : (
      <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
    );
  }

  function subStatusBadge(status: string) {
    const map: Record<string, { label: string; cls: string }> = {
      ACTIVE: { label: "Active", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
      EXPIRED: { label: "Expired", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400" },
      CANCELLED: { label: "Cancelled", cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
    };
    const entry = map[status] || { label: status, cls: "" };
    return <Badge className={`${entry.cls} text-[10px]`}>{entry.label}</Badge>;
  }

  // ─── Loading ───
  if (loadingServices) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <Skeleton className="skeleton-wave h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <PageHeader
        title="Add-on Services"
        description="Manage premium add-on services and subscriber subscriptions for speed boosts, data top-ups, and more."
        icon={Package}
        actions={
          <Button variant="outline" onClick={() => { fetchServices(); if (selectedSubId) fetchSubscriptions(selectedSubId); }}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs defaultValue="services" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="services" className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Services</TabsTrigger>
          <TabsTrigger value="subscriptions" className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5" />Subscriptions</TabsTrigger>
        </TabsList>

        {/* ─── Services Tab ─── */}
        <TabsContent value="services" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search services by name or type..." value={serviceSearch} onChange={(e) => { setServiceSearch(e.target.value); setServicePage(1); }} className="pl-9" />
            </div>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openAddService}>
              <Plus className="h-4 w-4 mr-2" />Add Service
            </Button>
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Price</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Validity</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Subscribers</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          {serviceSearch ? "No services match your search" : "No add-on services configured. Create one to start offering premium features."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedServices.map((service) => (
                        <TableRow key={service.id} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell>
                            <div className="text-sm font-medium">{service.name}</div>
                            {service.description && (
                              <div className="text-[10px] text-muted-foreground line-clamp-1 max-w-[200px]">{service.description}</div>
                            )}
                          </TableCell>
                          <TableCell>{typeBadge(service.type)}</TableCell>
                          <TableCell className="text-sm font-semibold">{formatINR(service.price)}</TableCell>
                          <TableCell className="text-xs hidden md:table-cell">
                            {service.validityDays ? (
                              <span>{service.validityDays} days</span>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Recurring</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs hidden md:table-cell">
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                              {service.subscriptionCount} active
                            </Badge>
                          </TableCell>
                          <TableCell>{serviceStatusBadge(service.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditService(service)}>
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {totalServicePages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {(servicePage - 1) * PAGE_SIZE + 1}–{Math.min(servicePage * PAGE_SIZE, filteredServices.length)} of {filteredServices.length}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={servicePage <= 1} onClick={() => setServicePage((p) => p - 1)}>Prev</Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={servicePage >= totalServicePages} onClick={() => setServicePage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Subscriptions Tab ─── */}
        <TabsContent value="subscriptions" className="space-y-4">
          {/* Subscriber search */}
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-end gap-3">
                <div className="flex-1 grid gap-2">
                  <Label className="text-xs font-medium">Search Subscriber</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Enter subscriber code or name..."
                      value={subSearch}
                      onChange={(e) => setSubSearch(e.target.value)}
                      className="pl-9"
                      onKeyDown={(e) => e.key === "Enter" && searchSubscriber()}
                    />
                  </div>
                </div>
                <Button variant="outline" onClick={searchSubscriber}>Search</Button>
              </div>
              {selectedSubId && (
                <div className="mt-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium">{selectedSubName}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {subscriptions.filter((s) => s.status === "ACTIVE").length} active
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          {selectedSubId && (
            <div className="flex items-center gap-2">
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openSubscribe}>
                <Plus className="h-4 w-4 mr-2" />Subscribe to Add-on
              </Button>
            </div>
          )}

          {/* Subscriptions table */}
          {selectedSubId && (
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  {loadingSubs ? (
                    <div className="p-6 space-y-3">
                      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Service</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Type</TableHead>
                          <TableHead className="text-xs">Price</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Subscribed</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Expires</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Auto-Renew</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subscriptions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                              No add-on subscriptions for this subscriber. Click "Subscribe to Add-on" to get started.
                            </TableCell>
                          </TableRow>
                        ) : (
                          subscriptions.map((sub) => (
                            <TableRow key={sub.id} className="hover:bg-muted/50 transition-colors duration-150">
                              <TableCell>
                                <div className="text-sm font-medium">{sub.serviceName}</div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">{typeBadge(sub.serviceType)}</TableCell>
                              <TableCell className="text-sm font-medium">{formatINR(sub.pricePaid)}</TableCell>
                              <TableCell className="text-xs hidden md:table-cell text-muted-foreground">
                                {new Date(sub.subscribedAt).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-xs hidden md:table-cell">
                                {sub.expiresAt ? (
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                    {new Date(sub.expiresAt).toLocaleDateString()}
                                  </div>
                                ) : (
                                  <Badge variant="outline" className="text-[10px]">Recurring</Badge>
                                )}
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Switch checked={sub.autoRenew} disabled size="sm" />
                              </TableCell>
                              <TableCell>{subStatusBadge(sub.status)}</TableCell>
                              <TableCell className="text-right">
                                {sub.status === "ACTIVE" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-red-600"
                                    onClick={() => { setUnsubscribingSub(sub); setUnsubscribeDialogOpen(true); }}
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />Unsubscribe
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Add Service Dialog ─── */}
      <Dialog open={addServiceDialogOpen} onOpenChange={setAddServiceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Add-on Service</DialogTitle>
            <DialogDescription>Create a new add-on service that subscribers can subscribe to.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="svc-name">Service Name</Label>
              <Input id="svc-name" value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} placeholder="e.g., Night Speed Boost" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={serviceForm.type} onValueChange={(val) => setServiceForm({ ...serviceForm, type: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SPEED_BOOST">Speed Boost</SelectItem>
                    <SelectItem value="DATA_TOPUP">Data Topup</SelectItem>
                    <SelectItem value="STATIC_IP">Static IP</SelectItem>
                    <SelectItem value="PREMIUM_SUPPORT">Premium Support</SelectItem>
                    <SelectItem value="CONTENT_PASS">Content Pass</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="svc-price">Price (₹)</Label>
                <Input id="svc-price" type="number" value={serviceForm.price || ""} onChange={(e) => setServiceForm({ ...serviceForm, price: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="svc-validity">Validity (days, 0 = recurring)</Label>
              <Input id="svc-validity" type="number" value={serviceForm.validityDays || 0} onChange={(e) => setServiceForm({ ...serviceForm, validityDays: parseInt(e.target.value) || 0 })} />
              <p className="text-[10px] text-muted-foreground">Set to 0 for recurring (monthly) subscription.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="svc-desc">Description</Label>
              <Textarea id="svc-desc" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} placeholder="Describe what this add-on offers..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddServiceDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => saveService(false)} disabled={serviceSaving}>
              {serviceSaving ? "Creating..." : "Create Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Service Dialog ─── */}
      <Dialog open={editServiceDialogOpen} onOpenChange={setEditServiceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Add-on Service</DialogTitle>
            <DialogDescription>Update service details, pricing, and availability.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-svc-name">Service Name</Label>
              <Input id="edit-svc-name" value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={serviceForm.type} onValueChange={(val) => setServiceForm({ ...serviceForm, type: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SPEED_BOOST">Speed Boost</SelectItem>
                    <SelectItem value="DATA_TOPUP">Data Topup</SelectItem>
                    <SelectItem value="STATIC_IP">Static IP</SelectItem>
                    <SelectItem value="PREMIUM_SUPPORT">Premium Support</SelectItem>
                    <SelectItem value="CONTENT_PASS">Content Pass</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-svc-price">Price (₹)</Label>
                <Input id="edit-svc-price" type="number" value={serviceForm.price || ""} onChange={(e) => setServiceForm({ ...serviceForm, price: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-svc-validity">Validity (days, 0 = recurring)</Label>
              <Input id="edit-svc-validity" type="number" value={serviceForm.validityDays || 0} onChange={(e) => setServiceForm({ ...serviceForm, validityDays: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-svc-desc">Description</Label>
              <Textarea id="edit-svc-desc" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} rows={2} />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={serviceForm.status} onValueChange={(val) => setServiceForm({ ...serviceForm, status: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditServiceDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => saveService(true)} disabled={serviceSaving}>
              {serviceSaving ? "Saving..." : "Update Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Subscribe Dialog ─── */}
      <Dialog open={subscribeDialogOpen} onOpenChange={setSubscribeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subscribe to Add-on</DialogTitle>
            <DialogDescription>Choose an add-on service for {selectedSubName}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Available Services</Label>
              <Select value={subscribeServiceId} onValueChange={setSubscribeServiceId}>
                <SelectTrigger><SelectValue placeholder="Select an add-on service..." /></SelectTrigger>
                <SelectContent>
                  {services.filter((s) => s.status === "ACTIVE").map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {formatINR(s.price)} {s.validityDays ? `(${s.validityDays} days)` : "(Recurring)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubscribeDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={subscribe} disabled={subscribeSaving}>
              {subscribeSaving ? "Subscribing..." : "Subscribe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Unsubscribe Confirmation ─── */}
      <AlertDialog open={unsubscribeDialogOpen} onOpenChange={setUnsubscribeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsubscribe from Add-on</AlertDialogTitle>
            <AlertDialogDescription>
              This will unsubscribe <strong>{unsubscribingSub?.subscriberName}</strong> from <strong>{unsubscribingSub?.serviceName}</strong>.
              {unsubscribingSub?.expiresAt && ` The service was valid until ${new Date(unsubscribingSub.expiresAt).toLocaleDateString()}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={unsubscribe}>
              Unsubscribe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
