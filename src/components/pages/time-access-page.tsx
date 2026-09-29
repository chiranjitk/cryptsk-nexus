"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Clock, Plus, Search, Edit, Trash2, Loader2, CheckCircle2,
  User, Shield, Ban, UserPlus, UserMinus, Calendar, Timer, AlertTriangle,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
type TimeAction = "BLOCK" | "LIMIT_SPEED" | "ALLOW_ONLY" | "REDIRECT";

interface TimeAccessPolicy {
  id: string;
  name: string;
  description: string;
  days: string[];
  startTime: string;
  endTime: string;
  action: TimeAction;
  speedLimitDown: number;
  speedLimitUp: number;
  active: boolean;
  assignedCount: number;
}

interface PolicyAssignment {
  id: string;
  subscriberId: string;
  subscriberCode: string;
  subscriberName: string;
  policyId: string;
  policyName: string;
  assignedAt: string;
  active: boolean;
}

interface PolicyFormData {
  name: string;
  description: string;
  days: string[];
  startTime: string;
  endTime: string;
  action: TimeAction;
  speedLimitDown: number;
  speedLimitUp: number;
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const FALLBACK_POLICIES: TimeAccessPolicy[] = [
  { id: "tap-1", name: "Night Speed Limit", description: "Reduce speed during night hours to save bandwidth", days: ["Mon", "Tue", "Wed", "Thu", "Sun"], startTime: "23:00", endTime: "07:00", action: "LIMIT_SPEED", speedLimitDown: 10, speedLimitUp: 5, active: true, assignedCount: 245 },
  { id: "tap-2", name: "Kids Study Block", description: "Block social media during study hours", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "18:00", endTime: "21:00", action: "BLOCK", speedLimitDown: 0, speedLimitUp: 0, active: true, assignedCount: 78 },
  { id: "tap-3", name: "Weekend Unlimited", description: "Full speed on weekends", days: ["Sat", "Sun"], startTime: "00:00", endTime: "23:59", action: "ALLOW_ONLY", speedLimitDown: 100, speedLimitUp: 100, active: true, assignedCount: 312 },
  { id: "tap-4", name: "Office Hours Only", description: "Restrict residential connections during business hours", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], startTime: "09:00", endTime: "17:00", action: "LIMIT_SPEED", speedLimitDown: 5, speedLimitUp: 2, active: false, assignedCount: 15 },
  { id: "tap-5", name: "Captive Portal Redirect", description: "Redirect to portal for re-authentication", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], startTime: "02:00", endTime: "04:00", action: "REDIRECT", speedLimitDown: 0, speedLimitUp: 0, active: true, assignedCount: 0 },
];

const FALLBACK_ASSIGNMENTS: PolicyAssignment[] = [
  { id: "pa-1", subscriberId: "sub-104", subscriberCode: "CRY-00104", subscriberName: "Arun Mehta", policyId: "tap-1", policyName: "Night Speed Limit", assignedAt: "2025-01-10", active: true },
  { id: "pa-2", subscriberId: "sub-104", subscriberCode: "CRY-00104", subscriberName: "Arun Mehta", policyId: "tap-2", policyName: "Kids Study Block", assignedAt: "2025-01-12", active: true },
  { id: "pa-3", subscriberId: "sub-218", subscriberCode: "CRY-00218", subscriberName: "Priya Sharma", policyId: "tap-3", policyName: "Weekend Unlimited", assignedAt: "2025-01-08", active: true },
  { id: "pa-4", subscriberId: "sub-156", subscriberCode: "CRY-00156", subscriberName: "Rahul Verma", policyId: "tap-1", policyName: "Night Speed Limit", assignedAt: "2025-01-05", active: false },
  { id: "pa-5", subscriberId: "sub-89", subscriberCode: "CRY-00089", subscriberName: "Kiran Joshi", policyId: "tap-2", policyName: "Kids Study Block", assignedAt: "2025-01-14", active: true },
  { id: "pa-6", subscriberId: "sub-301", subscriberCode: "CRY-00301", subscriberName: "Sunita Devi", policyId: "tap-3", policyName: "Weekend Unlimited", assignedAt: "2025-01-09", active: true },
];

const emptyForm: PolicyFormData = {
  name: "", description: "", days: [], startTime: "00:00", endTime: "23:59",
  action: "LIMIT_SPEED", speedLimitDown: 10, speedLimitUp: 5,
};

// ─── Helpers ────────────────────────────────────────────────────
function getActionBadge(action: TimeAction) {
  const styles: Record<string, string> = {
    BLOCK: "bg-red-600 hover:bg-red-700 text-white",
    LIMIT_SPEED: "bg-amber-600 hover:bg-amber-700 text-white",
    ALLOW_ONLY: "bg-green-600 hover:bg-green-700 text-white",
    REDIRECT: "bg-purple-600 hover:bg-purple-700 text-white",
  };
  const labels: Record<string, string> = { BLOCK: "Block", LIMIT_SPEED: "Speed Limit", ALLOW_ONLY: "Allow Only", REDIRECT: "Redirect" };
  return <Badge className={`text-[10px] ${styles[action] || ""}`}>{labels[action] || action}</Badge>;
}

function formatKbps(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(0)} Mbps`;
  return `${kbps} Kbps`;
}

// ─── Component ────────────────────────────────────────────────────
export default function TimeAccessPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [policies, setPolicies] = useState<TimeAccessPolicy[]>([]);
  const [assignments, setAssignments] = useState<PolicyAssignment[]>([]);

  // Policies state
  const [policySearch, setPolicySearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [form, setForm] = useState<PolicyFormData>(emptyForm);

  // Assignments state
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [unassignOpen, setUnassignOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [assignSubscriberSearch, setAssignSubscriberSearch] = useState("");
  const [assignPolicyId, setAssignPolicyId] = useState("");
  const [assignSubscriberId, setAssignSubscriberId] = useState("");

  const demoSubscribers = [
    { id: "sub-100", code: "CRY-00100", name: "Vikram Rao" },
    { id: "sub-101", code: "CRY-00101", name: "Anita Desai" },
    { id: "sub-102", code: "CRY-00102", name: "Raj Malhotra" },
  ];
  const [subscriberResults, setSubscriberResults] = useState(demoSubscribers);
  const [showSubDropdown, setShowSubDropdown] = useState(false);

  // ─── Data Fetching ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/time-access-policies");
        if (!res.ok) throw new Error("Failed to fetch time access policies");
        const data = await res.json();
        if (data && typeof data === "object") {
          setPolicies(Array.isArray(data.policies) ? data.policies : Array.isArray(data) ? data : FALLBACK_POLICIES);
          setAssignments(Array.isArray(data.assignments) ? data.assignments : FALLBACK_ASSIGNMENTS);
        } else {
          setPolicies(FALLBACK_POLICIES);
          setAssignments(FALLBACK_ASSIGNMENTS);
        }
      } catch (err) {
        // logger
        setError(err instanceof Error ? err.message : "Unknown error");
        setPolicies(FALLBACK_POLICIES);
        setAssignments(FALLBACK_ASSIGNMENTS);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filteredPolicies = useMemo(() => {
    if (!policySearch) return policies;
    const q = policySearch.toLowerCase();
    return policies.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [policies, policySearch]);

  const filteredAssignments = useMemo(() => {
    if (!assignmentSearch) return assignments;
    const q = assignmentSearch.toLowerCase();
    return assignments.filter((a) => a.subscriberName.toLowerCase().includes(q) || a.subscriberCode.toLowerCase().includes(q) || a.policyName.toLowerCase().includes(q));
  }, [assignments, assignmentSearch]);

  async function handleSave(isEdit: boolean) {
    if (!form.name.trim()) { toast.error("Policy name is required"); return; }
    if (form.days.length === 0) { toast.error("Select at least one day"); return; }
    if (form.action === "LIMIT_SPEED" && form.speedLimitDown < 1) { toast.error("Speed limit must be at least 1 Kbps"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/time-access-policies", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: selectedPolicyId }),
      });
      if (!res.ok) throw new Error("Failed to save policy");
      if (isEdit) {
        setPolicies((prev) => prev.map((p) => p.id === selectedPolicyId ? { ...p, ...form } : p));
        setEditOpen(false); setSelectedPolicyId(null);
      } else {
        setPolicies((prev) => [...prev, { ...form, id: `tap-${Date.now()}`, active: true, assignedCount: 0 }] as TimeAccessPolicy[]);
        setAddOpen(false);
      }
      setForm(emptyForm);
      toast.success(isEdit ? "Policy updated" : "Policy created");
    } catch {
      toast.error("Failed to save policy");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setSubmitting(true);
    try {
      await fetch(`/api/time-access-policies?id=${selectedPolicyId}`, { method: "DELETE" });
      setPolicies((prev) => prev.filter((p) => p.id !== selectedPolicyId));
      setDeleteOpen(false); setSelectedPolicyId(null);
      toast.success("Policy deleted");
    } catch {
      toast.error("Failed to delete policy");
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(policy: TimeAccessPolicy) {
    setSelectedPolicyId(policy.id);
    setForm({ name: policy.name, description: policy.description, days: [...policy.days], startTime: policy.startTime, endTime: policy.endTime, action: policy.action, speedLimitDown: policy.speedLimitDown, speedLimitUp: policy.speedLimitUp });
    setEditOpen(true);
  }

  async function handleAssign() {
    if (!assignPolicyId) { toast.error("Select a policy"); return; }
    if (!assignSubscriberId) { toast.error("Select a subscriber"); return; }
    setSubmitting(true);
    try {
      await fetch("/api/time-access-policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", policyId: assignPolicyId, subscriberId: assignSubscriberId }) });
      setAssignOpen(false); setAssignPolicyId(""); setAssignSubscriberId(""); setAssignSubscriberSearch("");
      toast.success("Policy assigned successfully");
    } catch {
      toast.error("Failed to assign policy");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnassign() {
    setSubmitting(true);
    try {
      await fetch("/api/time-access-policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unassign", assignmentId: selectedAssignmentId }) });
      setAssignments((prev) => prev.filter((a) => a.id !== selectedAssignmentId));
      setUnassignOpen(false); setSelectedAssignmentId(null);
      toast.success("Policy unassigned");
    } catch {
      toast.error("Failed to unassign policy");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleDay(day: string) {
    setForm((prev) => ({ ...prev, days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day] }));
  }

  const totalActivePolicies = policies.filter((p) => p.active).length;
  const totalAssignments = assignments.filter((a) => a.active).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Time Access"
        description="Configure time-based access policies and manage subscriber assignments."
        icon={Clock}
        actions={
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { setForm(emptyForm); setAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Create Policy
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
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-sm shadow-teal-500/25"><Shield className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">{totalActivePolicies}</p><p className="text-xs text-muted-foreground font-medium">Active Policies</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-green-200/60 dark:ring-green-800/40 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm shadow-green-500/25"><UserPlus className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">{totalAssignments}</p><p className="text-xs text-muted-foreground font-medium">Active Assignments</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-amber-200/60 dark:ring-amber-800/40 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 shadow-sm shadow-amber-500/25"><Timer className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{policies.length}</p><p className="text-xs text-muted-foreground font-medium">Total Policies</p></div></div></CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-purple-200/60 dark:ring-purple-800/40 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/50 dark:to-violet-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-sm shadow-purple-500/25"><Calendar className="h-4 w-4 text-white" /></div><div><p className="text-2xl font-bold tabular-nums text-purple-700 dark:text-purple-300">{policies.reduce((sum, p) => sum + p.assignedCount, 0)}</p><p className="text-xs text-muted-foreground font-medium">Total Covered</p></div></div></CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="policies" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="policies" className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />Policies</TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5" />Assignments</TabsTrigger>
        </TabsList>

        {/* Policies Tab */}
        <TabsContent value="policies" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search policies..." value={policySearch} onChange={(e) => setPolicySearch(e.target.value)} className="pl-9" />
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Policy Name</TableHead>
                        <TableHead className="text-xs">Days</TableHead>
                        <TableHead className="text-xs">Time Range</TableHead>
                        <TableHead className="text-xs">Action</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Speed Limits</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Assigned</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPolicies.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No policies found.</TableCell></TableRow>
                      ) : (
                        filteredPolicies.map((policy) => (
                          <TableRow key={policy.id} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell>
                              <div>
                                <div className="text-xs font-medium">{policy.name}</div>
                                <div className="text-[10px] text-muted-foreground max-w-[180px] truncate">{policy.description}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-0.5">
                                {DAYS_OF_WEEK.map((day) => (
                                  <span key={day} className={`text-[9px] px-1 py-0.5 rounded ${policy.days.includes(day) ? "bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 font-medium" : "bg-muted text-muted-foreground"}`}>{day}</span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono tabular-nums">{policy.startTime} – {policy.endTime}</TableCell>
                            <TableCell>{getActionBadge(policy.action)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                              {policy.action === "LIMIT_SPEED" || policy.action === "ALLOW_ONLY" ? (
                                <span className="font-mono tabular-nums">↓{formatKbps(policy.speedLimitDown)} / ↑{formatKbps(policy.speedLimitUp)}</span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell tabular-nums">{policy.assignedCount}</TableCell>
                            <TableCell><Badge variant={policy.active ? "default" : "secondary"} className="text-[10px]">{policy.active ? "Active" : "Inactive"}</Badge></TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(policy)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => { setSelectedPolicyId(policy.id); setDeleteOpen(true); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assignments Tab */}
        <TabsContent value="assignments" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search subscriber or policy..." value={assignmentSearch} onChange={(e) => setAssignmentSearch(e.target.value)} className="pl-9" />
            </div>
            <Button variant="outline" onClick={() => setAssignOpen(true)}><UserPlus className="h-4 w-4 mr-2" />Assign Policy</Button>
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Subscriber</TableHead>
                        <TableHead className="text-xs">Policy</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Assigned Date</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssignments.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No assignments found.</TableCell></TableRow>
                      ) : (
                        filteredAssignments.map((assignment) => (
                          <TableRow key={assignment.id} className="hover:bg-muted/50 transition-colors duration-150">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center justify-center h-7 w-7 rounded-md bg-slate-100 dark:bg-slate-800"><User className="h-3.5 w-3.5 text-muted-foreground" /></div>
                                <div>
                                  <div className="text-xs font-medium">{assignment.subscriberName}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">{assignment.subscriberCode}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs font-medium">{assignment.policyName}</span></div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{new Date(assignment.assignedAt).toLocaleDateString()}</TableCell>
                            <TableCell><Badge variant={assignment.active ? "default" : "secondary"} className="text-[10px]">{assignment.active ? "Active" : "Inactive"}</Badge></TableCell>
                            <TableCell className="text-right">
                              {assignment.active && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => { setSelectedAssignmentId(assignment.id); setUnassignOpen(true); }}>
                                  <UserMinus className="h-3.5 w-3.5 mr-1" />Unassign
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Policy Dialog */}
      <Dialog open={addOpen || editOpen} onOpenChange={(open) => { if (!open) { setAddOpen(false); setEditOpen(false); setSelectedPolicyId(null); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />{editOpen ? "Edit Policy" : "Create Policy"}</DialogTitle>
            <DialogDescription>{editOpen ? "Update the time access policy." : "Define a new time-based access policy."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2"><Label>Policy Name</Label><Input placeholder="e.g. Night Speed Limit" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Input placeholder="Brief description of the policy" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Days of Week</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <button key={day} type="button" className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150 ${form.days.includes(day) ? "bg-teal-600 text-white border-teal-600 shadow-sm" : "bg-background text-muted-foreground border-border hover:border-teal-300"}`} onClick={() => toggleDay(day)}>{day}</button>
                ))}
              </div>
              {form.days.length === 7 && <p className="text-[10px] text-muted-foreground">All days selected</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Start Time</Label><Input type="time" value={form.startTime} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))} /></div>
              <div className="space-y-2"><Label>End Time</Label><Input type="time" value={form.endTime} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))} /></div>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={form.action} onValueChange={(v) => setForm((p) => ({ ...p, action: v as TimeAction }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BLOCK">Block Internet Access</SelectItem>
                  <SelectItem value="LIMIT_SPEED">Limit Speed</SelectItem>
                  <SelectItem value="ALLOW_ONLY">Allow Only (Full Speed)</SelectItem>
                  <SelectItem value="REDIRECT">Redirect to Portal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(form.action === "LIMIT_SPEED" || form.action === "ALLOW_ONLY") && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border">
                <div className="space-y-2"><Label className="text-xs">Download Speed (Kbps)</Label><Input type="number" min={1} value={form.speedLimitDown} onChange={(e) => setForm((p) => ({ ...p, speedLimitDown: parseInt(e.target.value) || 0 }))} /></div>
                <div className="space-y-2"><Label className="text-xs">Upload Speed (Kbps)</Label><Input type="number" min={1} value={form.speedLimitUp} onChange={(e) => setForm((p) => ({ ...p, speedLimitUp: parseInt(e.target.value) || 0 }))} /></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setEditOpen(false); setForm(emptyForm); }}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => handleSave(!!editOpen)} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}{editOpen ? "Update" : "Create"} Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Policy Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Assign Policy</DialogTitle>
            <DialogDescription>Assign a time access policy to a subscriber.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Policy</Label>
              <Select value={assignPolicyId} onValueChange={setAssignPolicyId}>
                <SelectTrigger><SelectValue placeholder="Select a policy" /></SelectTrigger>
                <SelectContent>{policies.filter((p) => p.active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 relative">
              <Label>Subscriber</Label>
              {assignSubscriberId ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">{demoSubscribers.find((s) => s.id === assignSubscriberId)?.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{demoSubscribers.find((s) => s.id === assignSubscriberId)?.code}</span>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search subscriber..." value={assignSubscriberSearch} onChange={(e) => {
                    setAssignSubscriberSearch(e.target.value);
                    if (e.target.value.length >= 1) {
                      const results = demoSubscribers.filter((s) => s.name.toLowerCase().includes(e.target.value.toLowerCase()) || s.code.toLowerCase().includes(e.target.value.toLowerCase()));
                      setSubscriberResults(results);
                      setShowSubDropdown(results.length > 0);
                    } else { setShowSubDropdown(false); }
                  }} className="pl-9" />
                  {showSubDropdown && (
                    <div className="absolute z-50 top-full mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-40 overflow-y-auto">
                      {subscriberResults.map((sub) => (
                        <button key={sub.id} className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors text-xs" onClick={() => { setAssignSubscriberId(sub.id); setAssignSubscriberSearch(sub.name); setShowSubDropdown(false); }}>
                          {sub.name} <span className="text-muted-foreground font-mono">({sub.code})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleAssign} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Policy Confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Policy</AlertDialogTitle><AlertDialogDescription>Are you sure? All subscriber assignments for this policy will be removed.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unassign Confirm */}
      <AlertDialog open={unassignOpen} onOpenChange={setUnassignOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Unassign Policy</AlertDialogTitle><AlertDialogDescription>Are you sure you want to remove this time access policy from the subscriber?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleUnassign} disabled={submitting}>{submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Unassign</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
