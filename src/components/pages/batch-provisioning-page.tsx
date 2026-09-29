"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Layers, Search, RefreshCw, Plus, Edit, Trash2, Play, Clock,
  CheckCircle2, XCircle, Loader2, FileSpreadsheet, Eye,
  Download, Pause,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

// ─── Types ────────────────────────────────────────────────────────
interface ProvisioningTemplate {
  id: string;
  name: string;
  description: string;
  planId: string;
  planName: string;
  area: string;
  connectionType: "PPPoE" | "DHCP" | "STATIC" | "HOTSPOT";
  macBinding: boolean;
  ipv4Type: "DYNAMIC" | "STATIC";
  ipv6Enabled: boolean;
  radiusEnabled: boolean;
  autoAssignIp: boolean;
  createdAt: string;
  usageCount: number;
}

interface BatchJob {
  id: string;
  templateId: string;
  templateName: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  totalItems: number;
  processedItems: number;
  failedItems: number;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: string;
  errorMessage: string | null;
  createdAt: string;
}

interface TemplateFormData {
  name: string;
  description: string;
  planId: string;
  area: string;
  connectionType: string;
  macBinding: boolean;
  ipv4Type: string;
  ipv6Enabled: boolean;
  radiusEnabled: boolean;
  autoAssignIp: boolean;
}

interface JobFormData {
  templateId: string;
  subscriberData: string; // CSV or newline-separated
}

// ─── Component ────────────────────────────────────────────────────
export default function BatchProvisioningPage() {
  const [templates, setTemplates] = useState<ProvisioningTemplate[]>([]);
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Template CRUD
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProvisioningTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormData>({
    name: "", description: "", planId: "", area: "", connectionType: "PPPoE",
    macBinding: false, ipv4Type: "DYNAMIC", ipv6Enabled: false, radiusEnabled: true, autoAssignIp: true,
  });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [deleteTemplateOpen, setDeleteTemplateOpen] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // Job creation
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [jobForm, setJobForm] = useState<JobFormData>({ templateId: "", subscriberData: "" });
  const [jobSaving, setJobSaving] = useState(false);
  const [viewJobOpen, setViewJobOpen] = useState(false);
  const [viewingJob, setViewingJob] = useState<BatchJob | null>(null);

  // ─── Data Fetching ───
  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const data = await apiFetch<{ templates: ProvisioningTemplate[] }>("/api/batch-provisioning/templates");
      setTemplates(data.templates || []);
    } catch {
      toast.error("Failed to load provisioning templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const data = await apiFetch<{ jobs: BatchJob[] }>("/api/batch-provisioning/jobs");
      setJobs(data.jobs || []);
    } catch {
      toast.error("Failed to load batch jobs");
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const fetchPlans = useCallback(async () => {
    try {
      const data = await apiFetch<{ plans: { id: string; name: string }[] }>("/api/plans?limit=100");
      setPlans(data.plans || []);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => { fetchTemplates(); fetchJobs(); fetchPlans(); }, [fetchTemplates, fetchJobs, fetchPlans]);

  // ─── Template CRUD ───
  function openAddTemplate() {
    setEditingTemplate(null);
    setTemplateForm({
      name: "", description: "", planId: "", area: "", connectionType: "PPPoE",
      macBinding: false, ipv4Type: "DYNAMIC", ipv6Enabled: false, radiusEnabled: true, autoAssignIp: true,
    });
    setTemplateDialogOpen(true);
  }

  function openEditTemplate(template: ProvisioningTemplate) {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      description: template.description,
      planId: template.planId,
      area: template.area,
      connectionType: template.connectionType,
      macBinding: template.macBinding,
      ipv4Type: template.ipv4Type,
      ipv6Enabled: template.ipv6Enabled,
      radiusEnabled: template.radiusEnabled,
      autoAssignIp: template.autoAssignIp,
    });
    setTemplateDialogOpen(true);
  }

  async function saveTemplate() {
    if (!templateForm.name.trim() || !templateForm.planId) {
      toast.error("Template name and plan are required");
      return;
    }
    setTemplateSaving(true);
    try {
      if (editingTemplate) {
        await apiFetch(`/api/batch-provisioning/templates/${editingTemplate.id}`, {
          method: "PUT",
          body: JSON.stringify(templateForm),
        });
        toast.success("Template updated");
      } else {
        await apiFetch("/api/batch-provisioning/templates", {
          method: "POST",
          body: JSON.stringify(templateForm),
        });
        toast.success("Template created");
      }
      setTemplateDialogOpen(false);
      fetchTemplates();
    } catch {
      toast.error("Failed to save template");
    } finally {
      setTemplateSaving(false);
    }
  }

  async function deleteTemplate() {
    if (!deletingTemplateId) return;
    try {
      await apiFetch(`/api/batch-provisioning/templates/${deletingTemplateId}`, { method: "DELETE" });
      toast.success("Template deleted");
      setDeleteTemplateOpen(false);
      setDeletingTemplateId(null);
      fetchTemplates();
    } catch {
      toast.error("Failed to delete template");
    }
  }

  // ─── Job creation ───
  function openNewJob() {
    if (templates.length === 0) {
      toast.error("Create a provisioning template first");
      return;
    }
    setJobForm({ templateId: "", subscriberData: "" });
    setJobDialogOpen(true);
  }

  async function createJob() {
    if (!jobForm.templateId || !jobForm.subscriberData.trim()) {
      toast.error("Select a template and provide subscriber data");
      return;
    }
    setJobSaving(true);
    try {
      await apiFetch("/api/batch-provisioning/jobs", {
        method: "POST",
        body: JSON.stringify(jobForm),
      });
      toast.success("Batch provisioning job created");
      setJobDialogOpen(false);
      fetchJobs();
      fetchTemplates(); // refresh usage counts
    } catch {
      toast.error("Failed to create batch job");
    } finally {
      setJobSaving(false);
    }
  }

  // ─── Helpers ───
  function jobStatusBadge(status: string) {
    const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
      PENDING: { label: "Pending", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300", icon: Clock },
      IN_PROGRESS: { label: "In Progress", cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300", icon: Loader2 },
      COMPLETED: { label: "Completed", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300", icon: CheckCircle2 },
      FAILED: { label: "Failed", cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300", icon: XCircle },
      CANCELLED: { label: "Cancelled", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400", icon: XCircle },
    };
    const entry = map[status] || { label: status, cls: "", icon: XCircle };
    const Icon = entry.icon;
    return (
      <Badge className={`${entry.cls} text-[10px] flex items-center gap-1 w-fit`}>
        <Icon className={`h-3 w-3 ${status === "IN_PROGRESS" ? "animate-spin" : ""}`} />
        {entry.label}
      </Badge>
    );
  }

  function jobProgress(job: BatchJob) {
    if (job.totalItems === 0) return 0;
    return Math.round((job.processedItems / job.totalItems) * 100);
  }

  function connectionTypeBadge(type: string) {
    const map: Record<string, { label: string; cls: string }> = {
      PPPoE: { label: "PPPoE", cls: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
      DHCP: { label: "DHCP", cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
      STATIC: { label: "Static", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300" },
      HOTSPOT: { label: "Hotspot", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
    };
    const entry = map[type] || { label: type, cls: "" };
    return <Badge className={`${entry.cls} text-[10px]`}>{entry.label}</Badge>;
  }

  // ─── Loading ───
  if (loadingTemplates) {
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
        title="Batch Provisioning"
        description="Create provisioning templates and run batch jobs to provision multiple subscribers efficiently."
        icon={Layers}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { fetchTemplates(); fetchJobs(); }}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
            <Button variant="outline" onClick={openNewJob}>
              <Play className="h-4 w-4 mr-2" />New Batch Job
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="templates" className="flex items-center gap-1.5"><FileSpreadsheet className="h-3.5 w-3.5" />Templates</TabsTrigger>
          <TabsTrigger value="jobs" className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Jobs
            {jobs.filter((j) => j.status === "IN_PROGRESS").length > 0 && (
              <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300 text-[10px] ml-1">
                {jobs.filter((j) => j.status === "IN_PROGRESS").length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Templates Tab ─── */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Define reusable provisioning templates with plan, connection type, and network settings.</p>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openAddTemplate}>
              <Plus className="h-4 w-4 mr-2" />Add Template
            </Button>
          </div>

          {templates.length === 0 ? (
            <Card className="border shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No provisioning templates yet.</p>
                <p className="text-xs mt-1">Create a template to quickly provision subscribers with standard settings.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className="border shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold">{template.name}</CardTitle>
                        {template.description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTemplate(template)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600"
                          onClick={() => { setDeletingTemplateId(template.id); setDeleteTemplateOpen(true); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-0.5">
                        <span className="text-muted-foreground">Plan</span>
                        <div className="font-medium">{template.planName}</div>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-muted-foreground">Connection</span>
                        <div>{connectionTypeBadge(template.connectionType)}</div>
                      </div>
                      {template.area && (
                        <div className="space-y-0.5">
                          <span className="text-muted-foreground">Area</span>
                          <div className="font-medium">{template.area}</div>
                        </div>
                      )}
                      <div className="space-y-0.5">
                        <span className="text-muted-foreground">IP Type</span>
                        <div className="font-medium">{template.ipv4Type === "STATIC" ? "Static" : "Dynamic"}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {template.macBinding && (
                        <Badge variant="outline" className="text-[10px]">MAC Binding</Badge>
                      )}
                      {template.ipv6Enabled && (
                        <Badge variant="outline" className="text-[10px] border-cyan-300 text-cyan-700">IPv6</Badge>
                      )}
                      {template.radiusEnabled && (
                        <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700">RADIUS</Badge>
                      )}
                      {template.autoAssignIp && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">Auto IP</Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-[10px] text-muted-foreground">
                        Used {template.usageCount} time{template.usageCount !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(template.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Jobs Tab ─── */}
        <TabsContent value="jobs" className="space-y-4">
          {jobs.length === 0 ? (
            <Card className="border shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Layers className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No batch provisioning jobs yet.</p>
                <p className="text-xs mt-1">Create a new batch job to provision subscribers in bulk.</p>
                <Button className="bg-red-600 hover:bg-red-700 text-white mt-4" size="sm" onClick={openNewJob}>
                  <Plus className="h-4 w-4 mr-2" />Create Batch Job
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Job</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Template</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Progress</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Stats</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Started</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Created By</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => {
                        const progress = jobProgress(job);
                        return (
                          <TableRow key={job.id} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell>
                              <div className="text-xs font-mono font-medium">#{job.id.slice(-8)}</div>
                            </TableCell>
                            <TableCell className="text-xs hidden md:table-cell">
                              <Badge variant="outline" className="text-[10px]">{job.templateName}</Badge>
                            </TableCell>
                            <TableCell>{jobStatusBadge(job.status)}</TableCell>
                            <TableCell className="hidden md:table-cell" style={{ minWidth: "140px" }}>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground">{progress}%</span>
                                  <span className="tabular-nums">{job.processedItems}/{job.totalItems}</span>
                                </div>
                                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      job.status === "FAILED" ? "bg-red-500" :
                                      job.status === "COMPLETED" ? "bg-emerald-500" :
                                      job.status === "CANCELLED" ? "bg-slate-400" :
                                      "bg-cyan-500"
                                    }`}
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="text-[10px] space-y-0.5">
                                <div className="flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                  <span className="tabular-nums">{job.processedItems - job.failedItems} success</span>
                                </div>
                                {job.failedItems > 0 && (
                                  <div className="flex items-center gap-1">
                                    <XCircle className="h-3 w-3 text-red-500" />
                                    <span className="tabular-nums text-red-600">{job.failedItems} failed</span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                              {job.startedAt ? new Date(job.startedAt).toLocaleString() : "—"}
                            </TableCell>
                            <TableCell className="text-xs hidden md:table-cell">{job.createdBy}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setViewingJob(job); setViewJobOpen(true); }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Template Add/Edit Dialog ─── */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Provisioning Template"}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? "Update the provisioning template settings." : "Define a reusable template with plan and network settings for batch provisioning."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tpl-name">Template Name</Label>
              <Input id="tpl-name" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder="e.g., Residential PPPoE Provisioning" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea id="tpl-desc" value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} placeholder="Brief description of this template..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Plan</Label>
                <Select value={templateForm.planId} onValueChange={(val) => setTemplateForm({ ...templateForm, planId: val })}>
                  <SelectTrigger><SelectValue placeholder="Select plan..." /></SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Connection Type</Label>
                <Select value={templateForm.connectionType} onValueChange={(val) => setTemplateForm({ ...templateForm, connectionType: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PPPoE">PPPoE</SelectItem>
                    <SelectItem value="DHCP">DHCP</SelectItem>
                    <SelectItem value="STATIC">Static IP</SelectItem>
                    <SelectItem value="HOTSPOT">Hotspot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-area">Area / Zone</Label>
              <Input id="tpl-area" value={templateForm.area} onChange={(e) => setTemplateForm({ ...templateForm, area: e.target.value })} placeholder="e.g., Downtown Zone A" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>IP Assignment</Label>
                <Select value={templateForm.ipv4Type} onValueChange={(val) => setTemplateForm({ ...templateForm, ipv4Type: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DYNAMIC">Dynamic (DHCP)</SelectItem>
                    <SelectItem value="STATIC">Static IP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tpl-plan">MAC Binding</Label>
                <div className="flex items-center h-9">
                  <Switch checked={templateForm.macBinding} onCheckedChange={(checked) => setTemplateForm({ ...templateForm, macBinding: checked })} />
                  <span className="text-xs text-muted-foreground ml-2">{templateForm.macBinding ? "Enabled" : "Disabled"}</span>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Additional Options</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label className="text-xs font-medium" htmlFor="tpl-ipv6">Enable IPv6</Label>
                  <Switch id="tpl-ipv6" checked={templateForm.ipv6Enabled} onCheckedChange={(checked) => setTemplateForm({ ...templateForm, ipv6Enabled: checked })} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label className="text-xs font-medium" htmlFor="tpl-radius">Enable RADIUS</Label>
                  <Switch id="tpl-radius" checked={templateForm.radiusEnabled} onCheckedChange={(checked) => setTemplateForm({ ...templateForm, radiusEnabled: checked })} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 mt-3">
                <div>
                  <Label className="text-xs font-medium" htmlFor="tpl-autoip">Auto-assign IP</Label>
                  <p className="text-[10px] text-muted-foreground">Automatically assign an IP address from the pool</p>
                </div>
                <Switch id="tpl-autoip" checked={templateForm.autoAssignIp} onCheckedChange={(checked) => setTemplateForm({ ...templateForm, autoAssignIp: checked })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={saveTemplate} disabled={templateSaving}>
              {templateSaving ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── New Job Dialog ─── */}
      <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Batch Provisioning Job</DialogTitle>
            <DialogDescription>Select a template and provide subscriber data to provision in bulk.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Template</Label>
              <Select value={jobForm.templateId} onValueChange={(val) => setJobForm({ ...jobForm, templateId: val })}>
                <SelectTrigger><SelectValue placeholder="Select a provisioning template..." /></SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.planName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="job-data">Subscriber Data</Label>
              <Textarea
                id="job-data"
                value={jobForm.subscriberData}
                onChange={(e) => setJobForm({ ...jobForm, subscriberData: e.target.value })}
                placeholder={`Enter subscriber data, one per line:\nname, phone, email, address\nname, phone, email, address`}
                rows={8}
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                CSV format: name, phone, email, address (one per line). Headers will be auto-detected.
              </p>
              {jobForm.subscriberData.trim() && (
                <p className="text-[10px] text-muted-foreground">
                  {jobForm.subscriberData.trim().split("\n").filter((l) => l.trim()).length} subscriber(s) detected
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJobDialogOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={createJob} disabled={jobSaving}>
              {jobSaving ? "Creating..." : "Start Batch Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── View Job Details Dialog ─── */}
      <Dialog open={viewJobOpen} onOpenChange={setViewJobOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch Job Details</DialogTitle>
            <DialogDescription>Details for job #{viewingJob?.id.slice(-8)}</DialogDescription>
          </DialogHeader>
          {viewingJob && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <div>{jobStatusBadge(viewingJob.status)}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Template</span>
                  <div className="text-sm font-medium">{viewingJob.templateName}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Created By</span>
                  <div className="text-sm">{viewingJob.createdBy}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Created At</span>
                  <div className="text-sm">{new Date(viewingJob.createdAt).toLocaleString()}</div>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs text-muted-foreground">Progress</span>
                <div className="flex items-center justify-between text-xs">
                  <span className="tabular-nums">{viewingJob.processedItems} / {viewingJob.totalItems} processed</span>
                  <span className="font-medium">{jobProgress(viewingJob)}%</span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      viewingJob.status === "FAILED" ? "bg-red-500" :
                      viewingJob.status === "COMPLETED" ? "bg-emerald-500" :
                      "bg-cyan-500"
                    }`}
                    style={{ width: `${jobProgress(viewingJob)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{viewingJob.processedItems - viewingJob.failedItems}</p>
                  <p className="text-[10px] text-muted-foreground">Successful</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-red-700 dark:text-red-300">{viewingJob.failedItems}</p>
                  <p className="text-[10px] text-muted-foreground">Failed</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-lg font-bold tabular-nums text-muted-foreground">{viewingJob.totalItems - viewingJob.processedItems}</p>
                  <p className="text-[10px] text-muted-foreground">Remaining</p>
                </div>
              </div>

              {viewingJob.startedAt && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Started At</span>
                  <div className="text-sm">{new Date(viewingJob.startedAt).toLocaleString()}</div>
                </div>
              )}
              {viewingJob.completedAt && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Completed At</span>
                  <div className="text-sm">{new Date(viewingJob.completedAt).toLocaleString()}</div>
                </div>
              )}
              {viewingJob.errorMessage && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3">
                  <span className="text-xs font-medium text-red-700 dark:text-red-400">Error</span>
                  <p className="text-xs text-red-600 dark:text-red-300 mt-1">{viewingJob.errorMessage}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete Template Confirmation ─── */}
      <AlertDialog open={deleteTemplateOpen} onOpenChange={setDeleteTemplateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Provisioning Template</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this template. Existing batch jobs that used this template will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={deleteTemplate}>
              Delete Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
