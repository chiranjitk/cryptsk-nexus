"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, AlertCircle, Clock, Users, Plus, RefreshCw, CheckCircle2,
  MessageSquare, Wrench, CalendarClock, Shield, Info, Loader2, Download,
  FileText, Play, Ban, IndianRupee, Tag, ArrowUpCircle, GitMerge,
  UserCircle, Timer, FileSearch, ClipboardList, Eye, Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { apiFetch, safeJsonParse, formatINR } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────
interface IncidentUpdateItem { id: string; message: string; createdAt: string; createdById: string | null; }
interface AssignedUser { id: string; name: string; email: string; }
interface RCAData { rootCause: string; category: string; actionItems: string; preventionMeasures: string; }

interface Incident {
  id: string; title: string; description: string; severity: string; status: string;
  affectedAreaIds: string; affectedDeviceIds: string; affectedSubscriberCount: number;
  startedAt: string; resolvedAt: string | null; resolution: string; createdById: string | null;
  createdAt: string; updatedAt: string; updates: IncidentUpdateItem[]; tags: string;
  estimatedCost: number; escalationLevel: number; rcaReport: string; rcaData: string;
  escalationHistory: string; targetResolutionHours: number;
  assignedToId: string | null; assignedTo: AssignedUser | null;
}

interface Maintenance { id: string; title: string; description: string; scheduledAt: string; endTime: string; affectedAreaIds: string; status: string; }
interface NetworkAlert { id: string; title: string; message: string; source: string; deviceId: string; severity: string; createdAt: string; }
interface SlaSettings { incidentSlaMinutes: number; CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number; }
interface AffectedSubscriber { id: string; name: string; phone: string; email: string; status: string; plan: { name: string } | null; }

const INCIDENT_TEMPLATES = [
  { id: "fiber-cut", name: "Fiber Cut - Area Outage", icon: AlertTriangle, severity: "CRITICAL", description: "Fiber cable cut detected. Multiple subscribers affected." },
  { id: "router-failure", name: "Router Failure", icon: AlertCircle, severity: "MAJOR", description: "Core router failure causing connectivity issues." },
  { id: "dns-issues", name: "DNS Issues", icon: Info, severity: "MINOR", description: "Intermittent DNS resolution failures reported." },
  { id: "power-outage", name: "Power Outage - Tower Down", icon: AlertTriangle, severity: "CRITICAL", description: "Power outage at tower site. All services down." },
  { id: "planned-maintenance", name: "Planned Maintenance", icon: Wrench, severity: "MINOR", description: "Planned network maintenance activity." },
];

const SEVERITY_STYLES: Record<string, { border: string; icon: React.ElementType }> = {
  CRITICAL: { border: "border-l-4 border-l-red-600", icon: AlertTriangle },
  MAJOR: { border: "border-l-4 border-l-orange-500", icon: AlertCircle },
  MINOR: { border: "border-l-4 border-l-yellow-500", icon: Info },
};
const SEVERITY_BADGES: Record<string, string> = { CRITICAL: "bg-red-100 text-red-800 border-red-200", MAJOR: "bg-orange-100 text-orange-800 border-orange-200", MINOR: "bg-yellow-100 text-yellow-800 border-yellow-200" };
const STATUS_BADGES: Record<string, string> = { INVESTIGATING: "bg-teal-100 text-teal-800 border-teal-200", IDENTIFIED: "bg-purple-100 text-purple-800 border-purple-200", MONITORING: "bg-amber-100 text-amber-800 border-amber-200", RESOLVED: "bg-green-100 text-green-800 border-green-200", MERGED: "bg-gray-100 text-gray-500 border-gray-200" };
const ESCALATION_BADGES: Record<number, string> = { 0: "bg-gray-100 text-gray-600 border-gray-200", 1: "bg-yellow-100 text-yellow-700 border-yellow-200", 2: "bg-orange-100 text-orange-700 border-orange-200", 3: "bg-red-100 text-red-700 border-red-200" };
const MAINT_STATUS_BADGES: Record<string, string> = { scheduled: "bg-teal-100 text-teal-700 border-teal-200", "IN PROGRESS": "bg-amber-100 text-amber-700 border-amber-200", COMPLETED: "bg-green-100 text-green-700 border-green-200", CANCELLED: "bg-gray-100 text-gray-500 border-gray-200" };

// ─── Helpers ──────────────────────────────────────────────
function StatCard({ title, value, subtitle, icon: Icon, gradient, delay }: { title: string; value: string | number; subtitle: string; icon: React.ElementType; gradient: string; delay: number }) {
  return (
    <Card className={`${gradient} border-0 shadow-lg animate-card-enter`} style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-5"><div className="flex items-start justify-between"><div className="flex-1 min-w-0"><p className="text-xs font-medium uppercase tracking-wider opacity-80">{title}</p><p className="text-2xl font-bold mt-2 tabular-nums">{value}</p><p className="text-xs mt-1 opacity-75">{subtitle}</p></div><div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm"><Icon className="h-5 w-5" /></div></div></CardContent>
    </Card>
  );
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) { const h = Math.floor(minutes / 60); const m = Math.round(minutes % 60); return `${h}h ${m}m`; }
  return `${Math.round(minutes)}m`;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

function parseTags(tagsStr: string): string[] { return safeJsonParse<string[]>(tagsStr, []); }

function getSlaMinutes(severity: string, slaSettings: SlaSettings): number {
  switch (severity) { case "CRITICAL": return slaSettings.CRITICAL; case "HIGH": return slaSettings.HIGH; case "MEDIUM": return slaSettings.MEDIUM; default: return slaSettings.incidentSlaMinutes; }
}

function SlaTimer({ startedAt, severity, targetHours, slaSettings }: { startedAt: string; severity: string; targetHours?: number; slaSettings: SlaSettings }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const update = () => setElapsed((Date.now() - new Date(startedAt).getTime()) / 60000);
    update(); const interval = setInterval(update, 30000); return () => clearInterval(interval);
  }, [startedAt]);
  const sla = targetHours ? targetHours * 60 : getSlaMinutes(severity, slaSettings);
  const remaining = Math.max(0, sla - elapsed);
  const breached = elapsed > sla;
  const percent = Math.min(100, (elapsed / sla) * 100);
  return (
    <div className={`flex items-center gap-2 text-xs ${breached ? "text-red-600" : remaining < 15 ? "text-yellow-600" : "text-muted-foreground"}`}>
      <Timer className="h-3.5 w-3.5" />
      {breached ? <span className="font-medium">BREACHED by {formatDuration(elapsed - sla)}</span> : <span>{formatDuration(remaining)} remaining</span>}
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${breached ? "bg-red-500" : remaining < 15 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

// ─── Incidents Page ────────────────────────────────────────
export function IncidentsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("active");
  const [createIncidentOpen, setCreateIncidentOpen] = useState(false);
  const [updateIncidentId, setUpdateIncidentId] = useState<string | null>(null);
  const [resolveIncidentId, setResolveIncidentId] = useState<string | null>(null);
  const [createMaintenanceOpen, setCreateMaintenanceOpen] = useState(false);
  const [newUpdate, setNewUpdate] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");

  // Dialog states
  const [rcaIncidentId, setRcaIncidentId] = useState<string | null>(null);
  const [rcaRootCause, setRcaRootCause] = useState("");
  const [rcaCategory, setRcaCategory] = useState("Unknown");
  const [rcaActionItems, setRcaActionItems] = useState("");
  const [rcaPrevention, setRcaPrevention] = useState("");
  const [assignIncidentId, setAssignIncidentId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [autoDetectOpen, setAutoDetectOpen] = useState(false);
  const [filterAssigned, setFilterAssigned] = useState<string>("all");

  // Escalate dialog
  const [escalateIncidentId, setEscalateIncidentId] = useState<string | null>(null);
  const [escalateLevel, setEscalateLevel] = useState("1");
  const [escalateReason, setEscalateReason] = useState("");

  // Affected subscribers dialog
  const [subsDialogIncidentId, setSubsDialogIncidentId] = useState<string | null>(null);

  // Forms
  const [incidentForm, setIncidentForm] = useState({
    title: "", description: "", severity: "MAJOR" as "CRITICAL" | "MAJOR" | "MINOR", area: "", affectedDevices: "", tags: "", estimatedCost: "", targetResolutionHours: "2", assignedTo: "",
  });
  const [maintenanceForm, setMaintenanceForm] = useState({ title: "", description: "", windowStart: "", windowEnd: "", affectedAreas: "" });

  // ── Fetch ──
  const { data, isLoading, refetch } = useQuery<{
    stats: { activeIncidents: number; openIncidents: number; mttr: number; affectedSubscribers: number };
    incidents: Incident[]; maintenance: Maintenance[]; history: Incident[];
    users: { id: string; name: string; role: string }[];
    activeAlerts: NetworkAlert[]; slaSettings: SlaSettings;
  }>({
    queryKey: ["incidents", filterAssigned],
    queryFn: () => apiFetch(`/api/incidents${filterAssigned !== "all" ? `?assignedToId=${filterAssigned}` : ""}`),
    refetchInterval: 30000,
  });

  const slaSettings = data?.slaSettings || { incidentSlaMinutes: 60, CRITICAL: 30, HIGH: 60, MEDIUM: 240, LOW: 480 };
  const stats = data?.stats || { activeIncidents: 0, openIncidents: 0, mttr: 0, affectedSubscribers: 0 };
  const activeIncidents = data?.incidents || [];
  const maintenance = data?.maintenance || [];
  const history = data?.history || [];
  const users = data?.users || [];
  const activeAlerts = data?.activeAlerts || [];

  // Affected subscribers query
  const { data: subsData } = useQuery<{ subscribers: AffectedSubscriber[] }>({
    queryKey: ["incident-subs", subsDialogIncidentId],
    queryFn: () => apiFetch(`/api/incidents?type=affected-subscribers&incidentId=${subsDialogIncidentId}`),
    enabled: !!subsDialogIncidentId,
  });

  // ── Mutations ──
  const createIncidentMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/incidents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Incident created"); setCreateIncidentOpen(false); setIncidentForm({ title: "", description: "", severity: "MAJOR", area: "", affectedDevices: "", tags: "", estimatedCost: "", targetResolutionHours: "2", assignedTo: "" }); queryClient.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: () => toast.error("Failed to create incident"),
  });

  const resolveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/incidents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Incident resolved"); setResolveIncidentId(null); setResolutionNotes(""); queryClient.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: () => toast.error("Failed"),
  });

  const rcaMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/incidents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("RCA saved"); setRcaIncidentId(null); setRcaRootCause(""); setRcaCategory("Unknown"); setRcaActionItems(""); setRcaPrevention(""); queryClient.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: () => toast.error("Failed to save RCA"),
  });

  const assignMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/incidents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Incident assigned"); setAssignIncidentId(null); setAssignUserId(""); queryClient.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: () => toast.error("Failed"),
  });

  const mergeMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/incidents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Merged"); setMergeDialogOpen(false); setMergeSourceId(""); setMergeTargetId(""); queryClient.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: () => toast.error("Failed to merge"),
  });

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/incidents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Update added"); setUpdateIncidentId(null); setNewUpdate(""); queryClient.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: () => toast.error("Failed"),
  });

  const escalateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/incidents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Escalated"); setEscalateIncidentId(null); setEscalateLevel("1"); setEscalateReason(""); queryClient.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: () => toast.error("Failed to escalate"),
  });

  const autoDetectMutation = useMutation({
    mutationFn: () => apiFetch("/api/incidents", { method: "POST", body: JSON.stringify({ action: "auto-detect" }) }),
    onSuccess: (d) => { toast.success(`Auto-detected ${d.created?.length || 0} incidents`); queryClient.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: () => toast.error("Auto-detect failed"),
  });

  const createMaintenanceMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/incidents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Scheduled"); setCreateMaintenanceOpen(false); setMaintenanceForm({ title: "", description: "", windowStart: "", windowEnd: "", affectedAreas: "" }); queryClient.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: () => toast.error("Failed"),
  });

  const updateMaintenanceStatusMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/incidents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Updated"); queryClient.invalidateQueries({ queryKey: ["incidents"] }); },
    onError: () => toast.error("Failed"),
  });

  const handleTemplateSelect = (templateId: string) => {
    const t = INCIDENT_TEMPLATES.find((x) => x.id === templateId);
    if (t) setIncidentForm((prev) => ({ ...prev, title: t.name, description: t.description, severity: t.severity as typeof prev.severity }));
  };

  const handleAutoDetect = (alert: NetworkAlert) => {
    setIncidentForm((prev) => ({ ...prev, title: `[Auto] ${alert.title}`, description: `${alert.message}\n\nSource: ${alert.source}${alert.deviceId ? ` | Device: ${alert.deviceId}` : ""}\nAlert ID: ${alert.id}`, severity: alert.severity === "CRITICAL" ? "CRITICAL" : "MAJOR" }));
    setAutoDetectOpen(false); setCreateIncidentOpen(true);
  };

  const openRcaDialog = (incident: Incident) => {
    setRcaIncidentId(incident.id);
    const rca = safeJsonParse<RCAData>(incident.rcaData, {} as RCAData);
    setRcaRootCause(rca.rootCause || "");
    setRcaCategory(rca.category || "Unknown");
    setRcaActionItems(rca.actionItems || "");
    setRcaPrevention(rca.preventionMeasures || "");
  };

  const openResolveDialog = (incident: Incident) => { setResolveIncidentId(incident.id); setResolutionNotes(""); };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-5"><Skeleton className="skeleton-wave h-4 w-24 mb-3" /><Skeleton className="skeleton-wave h-8 w-16" /></CardContent></Card>)}</div>
        <Skeleton className="skeleton-wave h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Incidents / Outage</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Incident management & scheduled maintenance</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { const link = document.createElement("a"); link.href = "/api/incidents/export"; link.download = `incidents-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link); toast.success("CSV export started"); }}><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>

          {/* Auto-Detect from Alerts */}
          <Dialog open={autoDetectOpen} onOpenChange={setAutoDetectOpen}>
            <Button variant="outline" size="sm" onClick={() => setAutoDetectOpen(true)}><FileSearch className="h-3.5 w-3.5 mr-1.5" />Auto-Detect</Button>
            <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Auto-Detect from Alerts</DialogTitle><DialogDescription>Automatically create incidents from active device-down alerts.</DialogDescription></DialogHeader>
              <p className="text-xs text-muted-foreground">Select alerts or click "Auto-Detect All" to create incidents.</p>
              <div className="space-y-2 mt-2">
                {activeAlerts.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No active critical alerts</p> : activeAlerts.map((alert) => (
                  <Card key={alert.id} className="border cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleAutoDetect(alert)}>
                    <CardContent className="p-3"><div className="flex items-start justify-between gap-2"><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{alert.title}</p><p className="text-xs text-muted-foreground truncate">{alert.message}</p><p className="text-[10px] text-muted-foreground mt-1">{alert.source} {alert.deviceId ? `· ${alert.deviceId}` : ""}</p></div><Badge variant="outline" className={`text-[9px] shrink-0 ${alert.severity === "CRITICAL" ? SEVERITY_BADGES.CRITICAL : SEVERITY_BADGES.MAJOR}`}>{alert.severity}</Badge></div></CardContent>
                  </Card>
                ))}
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setAutoDetectOpen(false)}>Cancel</Button><Button onClick={() => autoDetectMutation.mutate()} disabled={autoDetectMutation.isPending}>{autoDetectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}Auto-Detect All</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
            <Button variant="outline" size="sm" onClick={() => setMergeDialogOpen(true)} disabled={activeIncidents.length < 2}><GitMerge className="h-3.5 w-3.5 mr-1.5" />Merge</Button>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Merge Duplicate Incidents</DialogTitle><DialogDescription>Select source and target. Source will be merged into target.</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Source (will be merged)</Label><Select value={mergeSourceId} onValueChange={setMergeSourceId}><SelectTrigger><SelectValue placeholder="Select source..." /></SelectTrigger><SelectContent>{activeIncidents.filter((i) => i.id !== mergeTargetId).map((i) => <SelectItem key={i.id} value={i.id}>{i.title.slice(0, 40)}...</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Target (will be kept)</Label><Select value={mergeTargetId} onValueChange={setMergeTargetId}><SelectTrigger><SelectValue placeholder="Select target..." /></SelectTrigger><SelectContent>{activeIncidents.filter((i) => i.id !== mergeSourceId).map((i) => <SelectItem key={i.id} value={i.id}>{i.title.slice(0, 40)}...</SelectItem>)}</SelectContent></Select></div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setMergeDialogOpen(false)}>Cancel</Button><Button onClick={() => mergeMutation.mutate({ action: "merge", sourceId: mergeSourceId, targetId: mergeTargetId })} disabled={!mergeSourceId || !mergeTargetId || mergeMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">{mergeMutation.isPending ? "Merging..." : "Merge"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={createMaintenanceOpen} onOpenChange={setCreateMaintenanceOpen}>
            <DialogTrigger asChild><Button variant="outline"><Wrench className="h-4 w-4 mr-2" />Schedule Maintenance</Button></DialogTrigger>
            <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Schedule Maintenance</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div><Label>Title</Label><Input value={maintenanceForm.title} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })} className="mt-1" /></div>
                <div><Label>Description</Label><Textarea value={maintenanceForm.description} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} rows={3} className="mt-1" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Window Start</Label><Input type="datetime-local" value={maintenanceForm.windowStart} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, windowStart: e.target.value })} className="mt-1" /></div>
                  <div><Label>Window End</Label><Input type="datetime-local" value={maintenanceForm.windowEnd} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, windowEnd: e.target.value })} className="mt-1" /></div>
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setCreateMaintenanceOpen(false)}>Cancel</Button><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => createMaintenanceMutation.mutate({ action: "create-maintenance", data: { title: maintenanceForm.title, description: maintenanceForm.description, scheduledAt: maintenanceForm.windowStart || new Date().toISOString(), endTime: maintenanceForm.windowEnd || new Date(Date.now() + 4 * 3600000).toISOString(), affectedAreaIds: JSON.stringify(maintenanceForm.affectedAreas.split(",").map((s) => s.trim()).filter(Boolean)) } })} disabled={!maintenanceForm.title || createMaintenanceMutation.isPending}>{createMaintenanceMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Schedule</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={createIncidentOpen} onOpenChange={(open) => { setCreateIncidentOpen(open); if (!open) setIncidentForm({ title: "", description: "", severity: "MAJOR", area: "", affectedDevices: "", tags: "", estimatedCost: "", targetResolutionHours: "2", assignedTo: "" }); }}>
            <DialogTrigger asChild><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"><Plus className="h-4 w-4 mr-2" />Create Incident</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Incident</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div><Label className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Template</Label><Select onValueChange={handleTemplateSelect}><SelectTrigger className="mt-1"><SelectValue placeholder="Select template..." /></SelectTrigger><SelectContent>{INCIDENT_TEMPLATES.map((t) => { const TIcon = t.icon; return <SelectItem key={t.id} value={t.id}><span className="flex items-center gap-2"><TIcon className="h-3.5 w-3.5" />{t.name}<Badge variant="outline" className={`text-[9px] ml-1 ${SEVERITY_BADGES[t.severity]}`}>{t.severity}</Badge></span></SelectItem>; })}</SelectContent></Select></div>
                <div><Label>Title *</Label><Input value={incidentForm.title} onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })} className="mt-1" /></div>
                <div><Label>Description</Label><Textarea value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} rows={3} className="mt-1" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Severity</Label><Select value={incidentForm.severity} onValueChange={(v) => setIncidentForm({ ...incidentForm, severity: v as "CRITICAL" | "MAJOR" | "MINOR" })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CRITICAL"><AlertTriangle className="h-3.5 w-3.5 inline mr-2 text-red-600" />Critical</SelectItem><SelectItem value="MAJOR"><AlertCircle className="h-3.5 w-3.5 inline mr-2 text-orange-500" />Major</SelectItem><SelectItem value="MINOR"><Info className="h-3.5 w-3.5 inline mr-2 text-yellow-500" />Minor</SelectItem></SelectContent></Select></div>
                  <div><Label>Assign To</Label><Select value={incidentForm.assignedTo} onValueChange={(v) => setIncidentForm({ ...incidentForm, assignedTo: v })}><SelectTrigger className="mt-1"><SelectValue placeholder="Select user..." /></SelectTrigger><SelectContent><SelectItem value="__none__">Unassigned</SelectItem>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div><Label>Affected Area</Label><Input value={incidentForm.area} onChange={(e) => setIncidentForm({ ...incidentForm, area: e.target.value })} className="mt-1" /></div>
                <div><Label>Affected Devices</Label><Input value={incidentForm.affectedDevices} onChange={(e) => setIncidentForm({ ...incidentForm, affectedDevices: e.target.value })} className="mt-1" placeholder="OLT-01, CCR-01" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" />Tags</Label><Input value={incidentForm.tags} onChange={(e) => setIncidentForm({ ...incidentForm, tags: e.target.value })} className="mt-1" placeholder="network, fiber, power" /></div>
                  <div><Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Target SLA (hrs)</Label><Input type="number" min="1" value={incidentForm.targetResolutionHours} onChange={(e) => setIncidentForm({ ...incidentForm, targetResolutionHours: e.target.value })} className="mt-1" /></div>
                </div>
                <div><Label className="flex items-center gap-1.5"><IndianRupee className="h-3.5 w-3.5" />Est. Revenue Loss (₹)</Label><Input type="number" min="0" value={incidentForm.estimatedCost} onChange={(e) => setIncidentForm({ ...incidentForm, estimatedCost: e.target.value })} className="mt-1" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateIncidentOpen(false)}>Cancel</Button>
                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => {
                  if (!incidentForm.title.trim()) { toast.error("Title is required"); return; }
                  if (!incidentForm.description.trim() || incidentForm.description.trim().length < 10) { toast.error("Description is required (min 10 characters)"); return; }
                  if (!incidentForm.severity) { toast.error("Severity is required"); return; }
                  createIncidentMutation.mutate({ action: "create-incident", data: { title: incidentForm.title, severity: incidentForm.severity, description: incidentForm.description, affectedAreaIds: JSON.stringify(incidentForm.area.split(",").map((s) => s.trim()).filter(Boolean)), affectedDeviceIds: JSON.stringify(incidentForm.affectedDevices.split(",").map((s) => s.trim()).filter(Boolean)), affectedSubscriberCount: 0, tags: JSON.stringify(incidentForm.tags.split(",").map((s) => s.trim()).filter(Boolean)), estimatedCost: parseFloat(incidentForm.estimatedCost) || 0, assignedToId: incidentForm.assignedTo || null, targetResolutionHours: parseInt(incidentForm.targetResolutionHours) || 2 } });
                }} disabled={createIncidentMutation.isPending}>{createIncidentMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Active Incidents" value={stats.activeIncidents} subtitle="Currently active" icon={AlertTriangle} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Open Incidents" value={stats.openIncidents} subtitle="Under investigation" icon={AlertCircle} gradient="stat-gradient-amber" delay={75} />
        <StatCard title="MTTR" value={formatDuration(stats.mttr)} subtitle="Mean time to resolve" icon={Clock} gradient="stat-gradient-purple" delay={150} />
        <StatCard title="Affected Subscribers" value={stats.affectedSubscribers.toLocaleString()} subtitle="Currently impacted" icon={Users} gradient="stat-gradient-green" delay={225} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="active">Active Incidents</TabsTrigger><TabsTrigger value="maintenance">Maintenance</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>

        {/* Active Incidents */}
        <TabsContent value="active" className="mt-6 space-y-4">
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Filter by assignee:</span>
            <Select value={filterAssigned} onValueChange={setFilterAssigned}><SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select>
          </div>

          {activeIncidents.length === 0 ? (
            <Card className="border"><CardContent className="py-16 text-center"><CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" /><p className="text-lg font-semibold">All Systems Operational</p><p className="text-sm text-muted-foreground mt-1">No active incidents.</p></CardContent></Card>
          ) : (
            activeIncidents.map((incident) => {
              const sev = SEVERITY_STYLES[incident.severity] || SEVERITY_STYLES.MINOR;
              const SevIcon = sev.icon;
              const tags = parseTags(incident.tags);
              const hasRca = !!incident.rcaReport && incident.rcaReport.length > 10;
              const escalationHistory = safeJsonParse<Array<{ level: number; timestamp: string; reason: string }>>(incident.escalationHistory, []);

              return (
                <Card key={incident.id} className={`${sev.border} shadow-sm`}>
                  <CardContent className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Title + badges */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <SevIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <h3 className="font-semibold text-foreground">{incident.title}</h3>
                          <Badge variant="outline" className={`text-[10px] ${SEVERITY_BADGES[incident.severity] || ""}`}>{incident.severity}</Badge>
                          <Badge variant="outline" className={`text-[10px] ${STATUS_BADGES[incident.status] || ""}`}>{incident.status}</Badge>
                          {incident.escalationLevel > 0 && (
                            <Badge variant="outline" className={`text-[10px] ${ESCALATION_BADGES[incident.escalationLevel] || ""}`}><ArrowUpCircle className="h-2.5 w-2.5 mr-0.5" />L{incident.escalationLevel}</Badge>
                          )}
                          {hasRca ? <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200"><ClipboardList className="h-2.5 w-2.5 mr-0.5" />RCA Done</Badge> : <Badge variant="outline" className="text-[10px] bg-gray-100 text-gray-500 border-gray-200">RCA Pending</Badge>}
                          {incident.targetResolutionHours > 0 && <Badge variant="outline" className="text-[10px] bg-teal-100 text-teal-700 border-teal-200"><Clock className="h-2.5 w-2.5 mr-0.5" />{incident.targetResolutionHours}h SLA</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{incident.description}</p>

                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {tags.slice(0, 5).map((tag) => <Badge key={tag} variant="secondary" className="text-[10px] bg-slate-100 text-slate-600"><Tag className="h-2.5 w-2.5 mr-1" />{tag}</Badge>)}
                            {tags.length > 5 && <Badge variant="secondary" className="text-[10px]">+{tags.length - 5}</Badge>}
                          </div>
                        )}

                        {/* Meta */}
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                          {(() => { const areas = safeJsonParse<string[]>(incident.affectedAreaIds, []); return areas.length > 0 && <span className="flex items-center gap-1"><Shield className="h-3 w-3" />{areas.join(", ")}</span>; })()}
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{incident.affectedSubscriberCount} affected</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(incident.startedAt)}</span>
                          {incident.estimatedCost > 0 && <span className="flex items-center gap-1 text-red-600 font-medium"><IndianRupee className="h-3 w-3" />{formatINR(incident.estimatedCost)} loss</span>}
                          {incident.assignedTo && <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200"><UserCircle className="h-2.5 w-2.5 mr-0.5" />{incident.assignedTo.name}</Badge>}
                        </div>

                        {/* SLA Timer */}
                        <div className="mt-2">
                          <SlaTimer startedAt={incident.startedAt} severity={incident.severity} targetHours={incident.targetResolutionHours} slaSettings={slaSettings} />
                        </div>

                        {/* Updates */}
                        <div className="mt-3 border-t pt-3">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Updates ({incident.updates.length})</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {incident.updates.map((u) => (
                              <div key={u.id} className="flex items-start gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#DC2626] mt-2 flex-shrink-0" /><div><p className="text-xs text-foreground">{u.message}</p><p className="text-[10px] text-muted-foreground">{timeAgo(u.createdAt)}</p></div></div>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
                          {/* Update */}
                          <Dialog open={updateIncidentId === incident.id} onOpenChange={(open) => { setUpdateIncidentId(open ? incident.id : null); if (!open) setNewUpdate(""); }}>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setUpdateIncidentId(incident.id)}><MessageSquare className="h-3 w-3 mr-1" />Update</Button>
                            <DialogContent><DialogHeader><DialogTitle>Add Update</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><Textarea value={newUpdate} onChange={(e) => setNewUpdate(e.target.value)} placeholder="Status update..." rows={4} /></div><DialogFooter><Button variant="outline" onClick={() => { setUpdateIncidentId(null); setNewUpdate(""); }}>Cancel</Button><Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => updateMutation.mutate({ action: "add-update", incidentId: incident.id, message: newUpdate })} disabled={!newUpdate || updateMutation.isPending}>{updateMutation.isPending ? "Adding..." : "Post"}</Button></DialogFooter></DialogContent>
                          </Dialog>

                          {/* Resolve with RCA */}
                          <Dialog open={resolveIncidentId === incident.id} onOpenChange={(open) => { if (!open) setResolveIncidentId(null); setResolutionNotes(""); }}>
                            <Button variant="outline" size="sm" className="h-7 text-xs text-green-600" onClick={() => openResolveDialog(incident)}><CheckCircle2 className="h-3 w-3 mr-1" />Resolve</Button>
                            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                              <DialogHeader><DialogTitle>Resolve Incident</DialogTitle><DialogDescription>Fill resolution details and optionally complete RCA.</DialogDescription></DialogHeader>
                              <div className="grid gap-4 py-4">
                                <p className="text-sm text-muted-foreground">Marking <strong>{incident.title}</strong> as resolved.</p>
                                <div><Label>Resolution</Label><Textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} rows={4} className="mt-1" /></div>
                                <hr className="my-3 border-border" />
                                <p className="text-sm font-medium">Root Cause Analysis (optional)</p>
                                <div className="space-y-3">
                                  <div><Label>Category</Label><Select value={rcaCategory} onValueChange={setRcaCategory}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Hardware">Hardware</SelectItem><SelectItem value="Software">Software</SelectItem><SelectItem value="Human">Human</SelectItem><SelectItem value="External">External</SelectItem><SelectItem value="Unknown">Unknown</SelectItem></SelectContent></Select></div>
                                  <div><Label>Root Cause</Label><Textarea value={rcaRootCause} onChange={(e) => setRcaRootCause(e.target.value)} rows={3} className="mt-1" placeholder="What caused this incident?" /></div>
                                  <div><Label>Action Items</Label><Textarea value={rcaActionItems} onChange={(e) => setRcaActionItems(e.target.value)} rows={2} className="mt-1" placeholder="Actions taken to resolve..." /></div>
                                  <div><Label>Prevention Measures</Label><Textarea value={rcaPrevention} onChange={(e) => setRcaPrevention(e.target.value)} rows={2} className="mt-1" placeholder="How to prevent recurrence?" /></div>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setResolveIncidentId(null)}>Cancel</Button>
                                <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => resolveMutation.mutate({ action: "resolve", incidentId: incident.id, resolution: resolutionNotes, rcaData: { rootCause: rcaRootCause, category: rcaCategory, actionItems: rcaActionItems, preventionMeasures: rcaPrevention } })} disabled={!resolutionNotes || resolveMutation.isPending}>{resolveMutation.isPending ? "Resolving..." : "Resolve"}</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>

                          {/* RCA */}
                          <Dialog open={rcaIncidentId === incident.id} onOpenChange={(open) => { if (!open) { setRcaIncidentId(null); setRcaRootCause(""); setRcaCategory("Unknown"); setRcaActionItems(""); setRcaPrevention(""); } else openRcaDialog(incident); }}>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openRcaDialog(incident)}><ClipboardList className="h-3 w-3 mr-1" />RCA</Button>
                            <DialogContent className="max-w-lg">
                              <DialogHeader><DialogTitle>Root Cause Analysis</DialogTitle></DialogHeader>
                              <div className="grid gap-4 py-4">
                                <div><Label>Category</Label><Select value={rcaCategory} onValueChange={setRcaCategory}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Hardware">Hardware</SelectItem><SelectItem value="Software">Software</SelectItem><SelectItem value="Human">Human</SelectItem><SelectItem value="External">External</SelectItem><SelectItem value="Unknown">Unknown</SelectItem></SelectContent></Select></div>
                                <div><Label>Root Cause</Label><Textarea value={rcaRootCause} onChange={(e) => setRcaRootCause(e.target.value)} rows={3} className="mt-1" placeholder="What caused this incident?" /></div>
                                <div><Label>Action Items</Label><Textarea value={rcaActionItems} onChange={(e) => setRcaActionItems(e.target.value)} rows={2} className="mt-1" placeholder="Actions taken to resolve..." /></div>
                                <div><Label>Prevention Measures</Label><Textarea value={rcaPrevention} onChange={(e) => setRcaPrevention(e.target.value)} rows={2} className="mt-1" placeholder="How to prevent recurrence?" /></div>
                              </div>
                              <DialogFooter><Button variant="outline" onClick={() => { setRcaIncidentId(null); }}>Cancel</Button><Button onClick={() => rcaMutation.mutate({ action: "save-rca", incidentId: incident.id, rcaReport: `Category: ${rcaCategory}\nRoot Cause: ${rcaRootCause}\nActions: ${rcaActionItems}\nPrevention: ${rcaPrevention}`, rcaData: { rootCause: rcaRootCause, category: rcaCategory, actionItems: rcaActionItems, preventionMeasures: rcaPrevention } })} disabled={rcaMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">{rcaMutation.isPending ? "Saving..." : "Save RCA"}</Button></DialogFooter>
                            </DialogContent>
                          </Dialog>

                          {/* Escalate */}
                          <Dialog open={escalateIncidentId === incident.id} onOpenChange={(open) => { if (!open) { setEscalateIncidentId(null); } }}>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEscalateIncidentId(incident.id)}><ArrowUpCircle className="h-3 w-3 mr-1" />Escalate</Button>
                            <DialogContent>
                              <DialogHeader><DialogTitle>Escalate Incident</DialogTitle></DialogHeader>
                              <div className="space-y-4 py-4">
                                <p className="text-sm text-muted-foreground">Current level: <Badge variant="outline" className={ESCALATION_BADGES[incident.escalationLevel]}>L{incident.escalationLevel}</Badge></p>
                                {escalationHistory.length > 0 && (
                                  <div className="border rounded-lg p-3 bg-muted/50"><p className="text-xs font-medium mb-2">Escalation History</p>
                                    <div className="space-y-1">{escalationHistory.map((e, i) => (<p key={i} className="text-[10px] text-muted-foreground"><span className="font-medium text-foreground">L{e.level}</span> — {e.reason} <span className="ml-1 opacity-60">{new Date(e.timestamp).toLocaleString()}</span></p>))}</div>
                                  </div>
                                )}
                                <div><Label>New Level</Label><Select value={escalateLevel} onValueChange={setEscalateLevel}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Level 1 — Operations</SelectItem><SelectItem value="2">Level 2 — Management</SelectItem><SelectItem value="3">Level 3 — Executive</SelectItem></SelectContent></Select></div>
                                <div><Label>Reason</Label><Textarea value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} rows={2} className="mt-1" placeholder="Reason for escalation..." /></div>
                              </div>
                              <DialogFooter><Button variant="outline" onClick={() => setEscalateIncidentId(null)}>Cancel</Button><Button onClick={() => escalateMutation.mutate({ action: "escalate", incidentId: incident.id, level: parseInt(escalateLevel), reason: escalateReason })} disabled={escalateMutation.isPending} className="bg-amber-600 hover:bg-amber-700 text-white">{escalateMutation.isPending ? "Escalating..." : "Escalate"}</Button></DialogFooter>
                            </DialogContent>
                          </Dialog>

                          {/* Assign */}
                          <Dialog open={assignIncidentId === incident.id} onOpenChange={(open) => { if (!open) { setAssignIncidentId(null); setAssignUserId(""); } else { setAssignIncidentId(incident.id); setAssignUserId(incident.assignedToId || ""); } }}>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAssignIncidentId(incident.id)}><UserCircle className="h-3 w-3 mr-1" />Assign</Button>
                            <DialogContent><DialogHeader><DialogTitle>Assign Incident</DialogTitle></DialogHeader>
                              <div className="space-y-4 py-4"><Select value={assignUserId} onValueChange={setAssignUserId}><SelectTrigger><SelectValue placeholder="Select user..." /></SelectTrigger><SelectContent><SelectItem value="__none__">Unassign</SelectItem>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
                              <DialogFooter><Button variant="outline" onClick={() => { setAssignIncidentId(null); }}>Cancel</Button><Button onClick={() => assignMutation.mutate({ action: "assign", incidentId: incident.id, assignedToId: assignUserId || null })} disabled={assignMutation.isPending}>{assignMutation.isPending ? "Assigning..." : "Assign"}</Button></DialogFooter>
                            </DialogContent>
                          </Dialog>

                          {/* Affected Subscribers */}
                          <Dialog open={subsDialogIncidentId === incident.id} onOpenChange={(open) => { if (!open) setSubsDialogIncidentId(null); }}>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSubsDialogIncidentId(incident.id)}><Users className="h-3 w-3 mr-1" />Subscribers</Button>
                            <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
                              <DialogHeader><DialogTitle>Affected Subscribers ({subsData?.subscribers?.length || 0})</DialogTitle></DialogHeader>
                              <div className="max-h-[50vh] overflow-y-auto">
                                <Table><TableHeader><TableRow><TableHead className="text-xs">Name</TableHead><TableHead className="text-xs">Phone</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">Plan</TableHead></TableRow></TableHeader><TableBody>
                                  {(subsData?.subscribers || []).length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No affected areas specified</TableCell></TableRow> : subsData!.subscribers.map((s) => (
                                    <TableRow key={s.id} className="hover:bg-muted/50 transition-colors duration-150"><TableCell className="text-sm font-medium">{s.name}</TableCell><TableCell className="text-sm"><a href={`tel:${s.phone}`} className="hover:text-[#DC2626] flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</a></TableCell><TableCell><Badge variant="outline" className={`text-[10px] ${s.status === "ACTIVE" ? "bg-green-100 text-green-700" : s.status === "SUSPENDED" ? "bg-red-100 text-red-700" : "bg-gray-100"}`}>{s.status}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{s.plan?.name || "—"}</TableCell></TableRow>
                                  ))}
                                </TableBody></Table>
                              </div>
                              <DialogFooter><Button onClick={() => setSubsDialogIncidentId(null)}>Close</Button></DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Maintenance */}
        <TabsContent value="maintenance" className="mt-6 space-y-4">
          {maintenance.length === 0 ? (
            <Card className="border"><CardContent className="py-16 text-center"><Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-3" /><p className="text-lg font-semibold">No Scheduled Maintenance</p></CardContent></Card>
          ) : maintenance.map((m) => (
            <Card key={m.id} className="border shadow-sm"><CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0"><h4 className="font-semibold">{m.title}</h4><p className="text-sm text-muted-foreground">{m.description}</p></div>
                <div className="flex items-center gap-2"><Badge variant="outline" className={MAINT_STATUS_BADGES[m.status] || ""}>{m.status}</Badge><span className="text-xs text-muted-foreground">{timeAgo(m.scheduledAt)}</span></div>
              </div>
              {m.status === "scheduled" && <div className="flex gap-2 mt-3 pt-3 border-t"><Button variant="outline" size="sm" onClick={() => updateMaintenanceStatusMutation.mutate({ action: "update-maintenance-status", maintenanceId: m.id, status: "IN PROGRESS" })} className="text-xs">Start</Button><Button variant="outline" size="sm" onClick={() => updateMaintenanceStatusMutation.mutate({ action: "update-maintenance-status", maintenanceId: m.id, status: "COMPLETED" })} className="text-xs text-green-600">Complete</Button><Button variant="outline" size="sm" onClick={() => updateMaintenanceStatusMutation.mutate({ action: "update-maintenance-status", maintenanceId: m.id, status: "CANCELLED" })} className="text-xs text-red-600">Cancel</Button></div>}
            </CardContent></Card>
          ))}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-6 space-y-4">
          {history.length === 0 ? (
            <Card className="border"><CardContent className="py-16 text-center"><CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" /><p className="text-lg font-semibold">No Resolved Incidents</p></CardContent></Card>
          ) : history.map((incident) => (
            <Card key={incident.id} className="border shadow-sm"><CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0"><h4 className="font-semibold">{incident.title}</h4><p className="text-sm text-muted-foreground">{incident.resolution}</p><p className="text-[10px] text-muted-foreground">{incident.startedAt ? `${new Date(incident.startedAt).toLocaleDateString()} → ${incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleDateString() : ""}` : ""}</p></div>
                <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700">Resolved</Badge>
              </div>
              {(() => { const rca = safeJsonParse<RCAData>(incident.rcaData, {} as RCAData); return rca.category && rca.category !== "Unknown" ? <p className="text-xs text-muted-foreground mt-2">RCA: <Badge variant="outline" className="text-[9px]">{rca.category}</Badge></p> : null; })()}
            </CardContent></Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
export default IncidentsPage;
