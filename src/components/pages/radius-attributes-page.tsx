"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Tag, Plus, Search, Edit, Trash2, User, Hash, ArrowUpDown,
  RefreshCw, FileText, Layers, CheckCircle2, XCircle,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// ─── Types ────────────────────────────────────────────────────────
interface AttributeDefinition {
  id: string;
  name: string;
  attributeName: string;
  vendor: string;
  type: "check" | "reply" | "vendor-specific";
  dataType: "string" | "integer" | "ipaddr" | "octets" | "date" | "abinary" | "ifid" | "ipv6addr" | "ipv6prefix";
  description: string;
  usageCount: number;
  createdAt: string;
}

interface UserAttribute {
  id: string;
  subscriberId: string;
  attributeDefId: string;
  value: string;
  createdAt: string;
  attributeDef?: AttributeDefinition;
  subscriber?: {
    id: string;
    name: string;
    code: string;
    serviceUsername: string;
  };
}

interface AttrDefFormData {
  name: string;
  attributeName: string;
  vendor: string;
  type: "check" | "reply" | "vendor-specific";
  dataType: string;
  description: string;
}

interface UserAttrFormData {
  subscriberId: string;
  attributeDefId: string;
  value: string;
}

// ─── Defaults ─────────────────────────────────────────────────────
const emptyDefForm: AttrDefFormData = {
  name: "",
  attributeName: "",
  vendor: "RADIUS Standard",
  type: "check",
  dataType: "string",
  description: "",
};

const emptyUserAttrForm: UserAttrFormData = {
  subscriberId: "",
  attributeDefId: "",
  value: "",
};

const DATA_TYPE_OPTIONS = [
  { value: "string", label: "String" },
  { value: "integer", label: "Integer" },
  { value: "ipaddr", label: "IPv4 Address" },
  { value: "ipv6addr", label: "IPv6 Address" },
  { value: "ipv6prefix", label: "IPv6 Prefix" },
  { value: "octets", label: "Octets" },
  { value: "date", label: "Date" },
  { value: "abinary", label: "Abstract Binary" },
  { value: "ifid", label: "Interface ID" },
];

const PAGE_SIZE = 10;

// ─── Component ────────────────────────────────────────────────────
export default function RadiusAttributesPage() {
  // ─── State ───
  const [attrDefs, setAttrDefs] = useState<AttributeDefinition[]>([]);
  const [userAttrs, setUserAttrs] = useState<UserAttribute[]>([]);
  const [loadingDefs, setLoadingDefs] = useState(true);
  const [loadingUserAttrs, setLoadingUserAttrs] = useState(false);

  // Attribute Definitions tab
  const [defSearch, setDefSearch] = useState("");
  const [defDialogOpen, setDefDialogOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<AttributeDefinition | null>(null);
  const [defForm, setDefForm] = useState<AttrDefFormData>(emptyDefForm);
  const [defSaving, setDefSaving] = useState(false);
  const [deleteDefOpen, setDeleteDefOpen] = useState(false);
  const [deletingDefId, setDeletingDefId] = useState<string | null>(null);
  const [defPage, setDefPage] = useState(1);

  // User Attributes tab
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [selectedSubscriberId, setSelectedSubscriberId] = useState<string | null>(null);
  const [selectedSubscriberName, setSelectedSubscriberName] = useState("");
  const [userAttrDialogOpen, setUserAttrDialogOpen] = useState(false);
  const [userAttrForm, setUserAttrForm] = useState<UserAttrFormData>(emptyUserAttrForm);
  const [userAttrSaving, setUserAttrSaving] = useState(false);
  const [deleteUserAttrOpen, setDeleteUserAttrOpen] = useState(false);
  const [deletingUserAttrId, setDeletingUserAttrId] = useState<string | null>(null);

  // Bulk set
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAttrDefId, setBulkAttrDefId] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkSubscriberIds, setBulkSubscriberIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // ─── Data Fetching ───
  const fetchAttrDefs = useCallback(async () => {
    setLoadingDefs(true);
    try {
      const data = await apiFetch<{ attributeDefinitions: AttributeDefinition[] }>("/api/radius-attributes/definitions");
      setAttrDefs(data.attributeDefinitions || []);
    } catch {
      toast.error("Failed to load attribute definitions");
    } finally {
      setLoadingDefs(false);
    }
  }, []);

  const fetchUserAttrs = useCallback(async (subId: string) => {
    setLoadingUserAttrs(true);
    try {
      const data = await apiFetch<{ userAttributes: UserAttribute[] }>(`/api/radius-attributes/user-attributes?subscriberId=${subId}`);
      setUserAttrs(data.userAttributes || []);
    } catch {
      toast.error("Failed to load user attributes");
      setUserAttrs([]);
    } finally {
      setLoadingUserAttrs(false);
    }
  }, []);

  useEffect(() => { fetchAttrDefs(); }, [fetchAttrDefs]);

  // ─── Filtering & Pagination ───
  const filteredDefs = attrDefs.filter(
    (d) =>
      !defSearch ||
      d.name.toLowerCase().includes(defSearch.toLowerCase()) ||
      d.attributeName.toLowerCase().includes(defSearch.toLowerCase()) ||
      d.vendor.toLowerCase().includes(defSearch.toLowerCase())
  );
  const totalDefPages = Math.ceil(filteredDefs.length / PAGE_SIZE);
  const paginatedDefs = filteredDefs.slice((defPage - 1) * PAGE_SIZE, defPage * PAGE_SIZE);

  // ─── Attribute Definition CRUD ───
  function openAddDef() {
    setEditingDef(null);
    setDefForm(emptyDefForm);
    setDefDialogOpen(true);
  }

  function openEditDef(def: AttributeDefinition) {
    setEditingDef(def);
    setDefForm({
      name: def.name,
      attributeName: def.attributeName,
      vendor: def.vendor,
      type: def.type,
      dataType: def.dataType,
      description: def.description,
    });
    setDefDialogOpen(true);
  }

  async function saveDef() {
    if (!defForm.name.trim() || !defForm.attributeName.trim()) {
      toast.error("Name and attribute name are required");
      return;
    }
    setDefSaving(true);
    try {
      if (editingDef) {
        await apiFetch(`/api/radius-attributes/definitions/${editingDef.id}`, {
          method: "PUT",
          body: JSON.stringify(defForm),
        });
        toast.success("Attribute definition updated");
      } else {
        await apiFetch("/api/radius-attributes/definitions", {
          method: "POST",
          body: JSON.stringify(defForm),
        });
        toast.success("Attribute definition created");
      }
      setDefDialogOpen(false);
      fetchAttrDefs();
    } catch {
      toast.error("Failed to save attribute definition");
    } finally {
      setDefSaving(false);
    }
  }

  async function deleteDef() {
    if (!deletingDefId) return;
    try {
      await apiFetch(`/api/radius-attributes/definitions/${deletingDefId}`, { method: "DELETE" });
      toast.success("Attribute definition deleted");
      setDeleteDefOpen(false);
      setDeletingDefId(null);
      fetchAttrDefs();
    } catch {
      toast.error("Failed to delete attribute definition");
    }
  }

  // ─── Subscriber search ───
  async function searchSubscriber() {
    if (!subscriberSearch.trim()) {
      toast.error("Enter a subscriber code or name to search");
      return;
    }
    try {
      const data = await apiFetch<{ subscribers: { id: string; name: string; code: string; serviceUsername: string }[] }>(
        `/api/subscribers?search=${encodeURIComponent(subscriberSearch)}&limit=1`
      );
      if (data.subscribers && data.subscribers.length > 0) {
        const sub = data.subscribers[0];
        setSelectedSubscriberId(sub.id);
        setSelectedSubscriberName(`${sub.name} (${sub.code})`);
        fetchUserAttrs(sub.id);
      } else {
        toast.error("No subscriber found");
        setSelectedSubscriberId(null);
        setSelectedSubscriberName("");
        setUserAttrs([]);
      }
    } catch {
      toast.error("Failed to search subscriber");
    }
  }

  // ─── User Attribute CRUD ───
  function openSetAttr() {
    if (!selectedSubscriberId) {
      toast.error("Search and select a subscriber first");
      return;
    }
    setUserAttrForm({ ...emptyUserAttrForm, subscriberId: selectedSubscriberId });
    setUserAttrDialogOpen(true);
  }

  function openBulkSet() {
    if (!selectedSubscriberId) {
      toast.error("Search and select a subscriber first");
      return;
    }
    setBulkAttrDefId("");
    setBulkValue("");
    setBulkSubscriberIds([selectedSubscriberId]);
    setBulkDialogOpen(true);
  }

  async function saveUserAttr() {
    if (!userAttrForm.attributeDefId || !userAttrForm.value.trim()) {
      toast.error("Select an attribute and enter a value");
      return;
    }
    setUserAttrSaving(true);
    try {
      await apiFetch("/api/radius-attributes/user-attributes", {
        method: "POST",
        body: JSON.stringify(userAttrForm),
      });
      toast.success("Attribute set successfully");
      setUserAttrDialogOpen(false);
      fetchUserAttrs(userAttrForm.subscriberId);
      fetchAttrDefs(); // refresh usage counts
    } catch {
      toast.error("Failed to set attribute");
    } finally {
      setUserAttrSaving(false);
    }
  }

  async function deleteUserAttr() {
    if (!deletingUserAttrId || !selectedSubscriberId) return;
    try {
      await apiFetch(`/api/radius-attributes/user-attributes/${deletingUserAttrId}`, { method: "DELETE" });
      toast.success("User attribute removed");
      setDeleteUserAttrOpen(false);
      setDeletingUserAttrId(null);
      fetchUserAttrs(selectedSubscriberId);
      fetchAttrDefs();
    } catch {
      toast.error("Failed to remove attribute");
    }
  }

  async function saveBulkSet() {
    if (!bulkAttrDefId || !bulkValue.trim()) {
      toast.error("Select an attribute and enter a value");
      return;
    }
    setBulkSaving(true);
    try {
      await apiFetch("/api/radius-attributes/user-attributes/bulk", {
        method: "POST",
        body: JSON.stringify({
          subscriberIds: bulkSubscriberIds,
          attributeDefId: bulkAttrDefId,
          value: bulkValue,
        }),
      });
      toast.success(`Bulk attribute set for ${bulkSubscriberIds.length} subscriber(s)`);
      setBulkDialogOpen(false);
      if (selectedSubscriberId) fetchUserAttrs(selectedSubscriberId);
    } catch {
      toast.error("Failed to bulk-set attribute");
    } finally {
      setBulkSaving(false);
    }
  }

  // ─── Type badge ───
  function typeBadge(type: string) {
    const map: Record<string, { label: string; cls: string }> = {
      check: { label: "Check", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
      reply: { label: "Reply", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
      "vendor-specific": { label: "VSA", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300" },
    };
    const entry = map[type] || { label: type, cls: "" };
    return <Badge className={`${entry.cls} text-[10px]`}>{entry.label}</Badge>;
  }

  // ─── Loading ───
  if (loadingDefs) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <Skeleton className="skeleton-wave h-10 w-full" />
        <Skeleton className="skeleton-wave h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <PageHeader
        title="Custom RADIUS Attributes"
        description="Define custom RADIUS attribute mappings and manage per-subscriber attribute overrides."
        icon={Tag}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { fetchAttrDefs(); if (selectedSubscriberId) fetchUserAttrs(selectedSubscriberId); }}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <Tabs defaultValue="definitions" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="definitions" className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" />Attribute Definitions</TabsTrigger>
          <TabsTrigger value="user-attrs" className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />User Attributes</TabsTrigger>
        </TabsList>

        {/* ─── Attribute Definitions Tab ─── */}
        <TabsContent value="definitions" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, attribute, or vendor..." value={defSearch} onChange={(e) => { setDefSearch(e.target.value); setDefPage(1); }} className="pl-9" />
            </div>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openAddDef}>
              <Plus className="h-4 w-4 mr-2" />Add Definition
            </Button>
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Attribute</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Vendor</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Data Type</TableHead>
                      <TableHead className="text-xs">Usage</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDefs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          {defSearch ? "No definitions match your search" : "No custom attribute definitions. Add one to get started."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedDefs.map((def) => (
                        <TableRow key={def.id} className="hover:bg-muted/50 transition-colors duration-150">
                          <TableCell className="font-medium text-sm">{def.name}</TableCell>
                          <TableCell className="font-mono text-xs">{def.attributeName}</TableCell>
                          <TableCell className="text-xs hidden md:table-cell">
                            <Badge variant="outline" className="text-[10px]">{def.vendor}</Badge>
                          </TableCell>
                          <TableCell>{typeBadge(def.type)}</TableCell>
                          <TableCell className="text-xs hidden md:table-cell capitalize">{def.dataType}</TableCell>
                          <TableCell>
                            {def.usageCount > 0 ? (
                              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                                {def.usageCount} subscriber{def.usageCount !== 1 ? "s" : ""}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDef(def)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600"
                                onClick={() => { setDeletingDefId(def.id); setDeleteDefOpen(true); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {totalDefPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {(defPage - 1) * PAGE_SIZE + 1}–{Math.min(defPage * PAGE_SIZE, filteredDefs.length)} of {filteredDefs.length}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={defPage <= 1} onClick={() => setDefPage((p) => p - 1)}>Prev</Button>
                    {Array.from({ length: totalDefPages }, (_, i) => i + 1).map((p) => (
                      <Button key={p} variant={p === defPage ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs" onClick={() => setDefPage(p)}>{p}</Button>
                    ))}
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={defPage >= totalDefPages} onClick={() => setDefPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── User Attributes Tab ─── */}
        <TabsContent value="user-attrs" className="space-y-4">
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
                      value={subscriberSearch}
                      onChange={(e) => setSubscriberSearch(e.target.value)}
                      className="pl-9"
                      onKeyDown={(e) => e.key === "Enter" && searchSubscriber()}
                    />
                  </div>
                </div>
                <Button variant="outline" onClick={searchSubscriber}>Search</Button>
              </div>
              {selectedSubscriberId && (
                <div className="mt-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium">{selectedSubscriberName}</span>
                  <Badge variant="outline" className="text-[10px]">{userAttrs.length} attribute{userAttrs.length !== 1 ? "s" : ""}</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          {selectedSubscriberId && (
            <div className="flex items-center gap-2">
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openSetAttr}>
                <Plus className="h-4 w-4 mr-2" />Set Attribute
              </Button>
              <Button variant="outline" onClick={openBulkSet}>
                <Hash className="h-4 w-4 mr-2" />Bulk Set
              </Button>
            </div>
          )}

          {/* Attributes table */}
          {selectedSubscriberId && (
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  {loadingUserAttrs ? (
                    <div className="p-6 space-y-3">
                      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Attribute</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Type</TableHead>
                          <TableHead className="text-xs">Value</TableHead>
                          <TableHead className="text-xs hidden md:table-cell">Set On</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {userAttrs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                              No custom attributes set for this subscriber. Click "Set Attribute" to add one.
                            </TableCell>
                          </TableRow>
                        ) : (
                          userAttrs.map((ua) => (
                            <TableRow key={ua.id} className="hover:bg-muted/50 transition-colors duration-150">
                              <TableCell>
                                <div className="font-medium text-sm">{ua.attributeDef?.name || "Unknown"}</div>
                                {ua.attributeDef?.attributeName && (
                                  <div className="text-[10px] text-muted-foreground font-mono">{ua.attributeDef.attributeName}</div>
                                )}
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                {ua.attributeDef ? typeBadge(ua.attributeDef.type) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                              <TableCell className="font-mono text-xs max-w-[200px] truncate">{ua.value}</TableCell>
                              <TableCell className="text-xs hidden md:table-cell text-muted-foreground">
                                {new Date(ua.createdAt).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-600"
                                  onClick={() => { setDeletingUserAttrId(ua.id); setDeleteUserAttrOpen(true); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
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

      {/* ─── Attribute Definition Dialog ─── */}
      <Dialog open={defDialogOpen} onOpenChange={setDefDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDef ? "Edit Attribute Definition" : "Add Attribute Definition"}</DialogTitle>
            <DialogDescription>
              {editingDef ? "Update the custom RADIUS attribute definition." : "Define a new custom RADIUS attribute that can be assigned to subscribers."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="def-name">Display Name</Label>
              <Input id="def-name" value={defForm.name} onChange={(e) => setDefForm({ ...defForm, name: e.target.value })} placeholder="e.g., Session Timeout Override" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="def-attr-name">RADIUS Attribute Name</Label>
              <Input id="def-attr-name" value={defForm.attributeName} onChange={(e) => setDefForm({ ...defForm, attributeName: e.target.value })} placeholder="e.g., Session-Timeout" className="font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Vendor</Label>
                <Select value={defForm.vendor} onValueChange={(val) => setDefForm({ ...defForm, vendor: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RADIUS Standard">RADIUS Standard</SelectItem>
                    <SelectItem value="Mikrotik">Mikrotik</SelectItem>
                    <SelectItem value="Cisco">Cisco</SelectItem>
                    <SelectItem value="Huawei">Huawei</SelectItem>
                    <SelectItem value="Juniper">Juniper</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Attribute Type</Label>
                <Select value={defForm.type} onValueChange={(val) => setDefForm({ ...defForm, type: val as AttrDefFormData["type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="reply">Reply</SelectItem>
                    <SelectItem value="vendor-specific">Vendor-Specific</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Data Type</Label>
              <Select value={defForm.dataType} onValueChange={(val) => setDefForm({ ...defForm, dataType: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATA_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="def-desc">Description</Label>
              <Textarea id="def-desc" value={defForm.description} onChange={(e) => setDefForm({ ...defForm, description: e.target.value })} placeholder="Optional description of this attribute..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDefDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={saveDef} disabled={defSaving}>
              {defSaving ? "Saving..." : editingDef ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Set Attribute Dialog ─── */}
      <Dialog open={userAttrDialogOpen} onOpenChange={setUserAttrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Custom Attribute</DialogTitle>
            <DialogDescription>Assign a custom RADIUS attribute to {selectedSubscriberName}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Attribute</Label>
              <Select value={userAttrForm.attributeDefId} onValueChange={(val) => setUserAttrForm({ ...userAttrForm, attributeDefId: val })}>
                <SelectTrigger><SelectValue placeholder="Select attribute definition..." /></SelectTrigger>
                <SelectContent>
                  {attrDefs.map((def) => (
                    <SelectItem key={def.id} value={def.id}>
                      {def.name} ({def.attributeName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="attr-value">Value</Label>
              <Input
                id="attr-value"
                value={userAttrForm.value}
                onChange={(e) => setUserAttrForm({ ...userAttrForm, value: e.target.value })}
                placeholder="Enter attribute value..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserAttrDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={saveUserAttr} disabled={userAttrSaving}>
              {userAttrSaving ? "Saving..." : "Set Attribute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Set Dialog ─── */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Set Attribute</DialogTitle>
            <DialogDescription>Set a custom attribute for multiple subscribers at once.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Attribute</Label>
              <Select value={bulkAttrDefId} onValueChange={setBulkAttrDefId}>
                <SelectTrigger><SelectValue placeholder="Select attribute definition..." /></SelectTrigger>
                <SelectContent>
                  {attrDefs.map((def) => (
                    <SelectItem key={def.id} value={def.id}>{def.name} ({def.attributeName})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-value">Value</Label>
              <Input id="bulk-value" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="Enter attribute value..." />
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                This will affect <span className="font-medium text-foreground">{bulkSubscriberIds.length} subscriber(s)</span>.
                Selected: {selectedSubscriberName}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={saveBulkSet} disabled={bulkSaving}>
              {bulkSaving ? "Applying..." : "Apply to Subscribers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialogs ─── */}
      <AlertDialog open={deleteDefOpen} onOpenChange={setDeleteDefOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Attribute Definition</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this attribute definition. Subscriber attributes using this definition will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={deleteDef}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteUserAttrOpen} onOpenChange={setDeleteUserAttrOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User Attribute</AlertDialogTitle>
            <AlertDialogDescription>This will remove this custom attribute from the subscriber.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={deleteUserAttr}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
