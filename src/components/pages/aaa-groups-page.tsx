"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Shield, Plus, Search, Edit, Trash2, Eye, Copy, ArrowLeft, Users, Layers,
  CheckCircle2, XCircle, Zap, Gauge, Clock, Database, Server,
  MoreHorizontal, AlertTriangle, Settings2, UserMinus,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types ────────────────────────────────────────────────────────

interface RadiusAttr {
  id: number;
  groupname: string;
  attribute: string;
  op: string;
  value: string;
}

interface AAAGroup {
  groupname: string;
  checkAttrs: RadiusAttr[];
  replyAttrs: RadiusAttr[];
  userCount: number;
  checkCount: number;
  replyCount: number;
  enrichment: {
    id: string;
    name: string;
    description: string;
    priority: number;
    speedLimitDown: number;
    speedLimitUp: number;
    dataLimit: number | null;
    sessionTimeout: number | null;
    framedIpv6Pool: string;
    delegatedIpv6PrefixPool: string;
  } | null;
  description: string;
  priority: number;
}

interface GroupDetail extends AAAGroup {
  checkAttrsMap: Record<string, RadiusAttr>;
  replyAttrsMap: Record<string, RadiusAttr>;
  assignedUsers: AssignedUser[];
  sessionStats: SessionStats;
}

interface AssignedUser {
  username: string;
  group_priority: number;
  user_group: string;
  subscriberId: string | null;
  subscriberName: string | null;
  subscriberCode: string | null;
  subscriberStatus: string | null;
  planId: string | null;
  planName: string | null;
}

interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  totalDownloadGB: number;
  totalUploadGB: number;
  totalDataGB: number;
  totalSessionSeconds: number;
  totalSessionHours: number;
}

interface GroupsResponse {
  success: boolean;
  groups: AAAGroup[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: { totalGroups: number; totalUsersAcrossGroups: number };
}

interface GroupDetailResponse {
  success: boolean;
  group: GroupDetail;
}

// ─── Constants ────────────────────────────────────────────────────

const COMMON_CHECK_ATTRS = [
  "Auth-Type",
  "Simultaneous-Use",
  "Login-Time",
  "Expire-After",
  "Session-Timeout",
  "Max-Daily-Session",
  "Max-Monthly-Session",
  "Access-Period",
  "Cleartext-Password",
];

const COMMON_REPLY_ATTRS = [
  "WISPr-Bandwidth-Max-Down",
  "WISPr-Bandwidth-Max-Up",
  "Mikrotik-Rate-Limit",
  "Mikrotik-Address-List",
  "Framed-IP-Address",
  "Framed-Pool",
  "Session-Timeout",
  "Idle-Timeout",
  "Acct-Interim-Interval",
  "Delegated-IPv6-Prefix-Pool",
  "Framed-IPv6-Pool",
];

const CHECK_OPS = ["==", ":=", "!=", ">", ">=", "<", "<=", "=~", "!~", "=*", "!*"];
const REPLY_OPS = ["=", ":=", "+=", "!=", ">", ">=", "<", "<=", "=~", "!~", "=*", "!*"];

const EMPTY_ATTR_FORM = { attribute: "", op: "==", value: "" };

// ─── Helpers ──────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}


// ─── Component ────────────────────────────────────────────────────
export default function AaaGroupsPage() {
  const queryClient = useQueryClient();

  // ─── State ───
  const [mainTab, setMainTab] = useState("groups");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  // Selected group for detail view
  const [selectedGroupname, setSelectedGroupname] = useState<string | null>(null);
  const [detailSubTab, setDetailSubTab] = useState("check-attrs");

  // Dialogs
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [cloneGroupOpen, setCloneGroupOpen] = useState(false);
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [attrDialogOpen, setAttrDialogOpen] = useState(false);
  const [attrDialogMode, setAttrDialogMode] = useState<"add-check" | "add-reply" | "edit-check" | "edit-reply">("add-check");
  const [attrDialogData, setAttrDialogData] = useState<{ id?: number; attribute: string; op: string; value: string }>(EMPTY_ATTR_FORM);
  const [removeAttrDialogOpen, setRemoveAttrDialogOpen] = useState(false);
  const [removeAttrTarget, setRemoveAttrTarget] = useState<{ id: number; type: "check" | "reply"; attribute: string } | null>(null);

  // Form state for Add/Edit Group
  const [groupForm, setGroupForm] = useState({
    groupname: "",
    description: "",
    priority: 0,
    speedLimitDown: 0,
    speedLimitUp: 0,
    dataLimit: "" as string,
    sessionTimeout: "" as string,
    checkAttrs: [{ attribute: "", op: "==" as string, value: "" }],
    replyAttrs: [{ attribute: "", op: "=" as string, value: "" }],
  });

  const [cloneForm, setCloneForm] = useState({ sourceGroupname: "", newGroupname: "" });

  // ─── Queries ───
  const { data: groupsData, isLoading: groupsLoading, isError: groupsError } = useQuery<GroupsResponse>({
    queryKey: ["aaa-groups", search, page, limit],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      return apiFetch<GroupsResponse>(`/api/aaa/groups?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const { data: groupDetail, isLoading: detailLoading } = useQuery<GroupDetailResponse>({
    queryKey: ["aaa-group-detail", selectedGroupname],
    queryFn: () => apiFetch<GroupDetailResponse>(`/api/aaa/groups/${encodeURIComponent(selectedGroupname!)}`),
    enabled: !!selectedGroupname,
  });

  // ─── Computed ───
  const groups = groupsData?.groups || [];
  const stats = groupsData?.stats || { totalGroups: 0, totalUsersAcrossGroups: 0 };
  const pagination = groupsData?.pagination;

  const totalPolicies = useMemo(
    () => groups.reduce((acc, g) => acc + (g.checkCount || 0) + (g.replyCount || 0), 0),
    [groups]
  );
  const avgUsersPerGroup = stats.totalGroups > 0 ? (stats.totalUsersAcrossGroups / stats.totalGroups).toFixed(1) : "0";

  // ─── Mutations ───

  const createGroupMutation = useMutation({
    mutationFn: (body: typeof groupForm) => {
      const payload: Record<string, unknown> = {
        groupname: body.groupname,
        description: body.description || undefined,
        priority: body.priority || 0,
        speedLimitDown: body.speedLimitDown || 0,
        speedLimitUp: body.speedLimitUp || 0,
        dataLimit: body.dataLimit ? Number(body.dataLimit) : null,
        sessionTimeout: body.sessionTimeout ? Number(body.sessionTimeout) : null,
      };
      const checks = body.checkAttrs.filter((a) => a.attribute.trim() && a.value.trim());
      if (checks.length > 0) payload.checkAttrs = checks;
      const replies = body.replyAttrs.filter((a) => a.attribute.trim() && a.value.trim());
      if (replies.length > 0) payload.replyAttrs = replies;
      return apiFetch<{ success?: boolean; error?: string; group?: unknown }>("/api/aaa/groups", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Group '${groupForm.groupname}' created successfully`);
      setAddGroupOpen(false);
      resetGroupForm();
      queryClient.invalidateQueries({ queryKey: ["aaa-groups"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create group"),
  });

  const updateEnrichmentMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ success?: boolean; error?: string; message?: string; action?: string }>("/api/aaa/groups", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Group updated successfully");
      setEditGroupOpen(false);
      queryClient.invalidateQueries({ queryKey: ["aaa-groups"] });
      if (selectedGroupname) queryClient.invalidateQueries({ queryKey: ["aaa-group-detail", selectedGroupname] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update group"),
  });

  const attrMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ success?: boolean; error?: string; action?: string }>("/api/aaa/groups", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      const action = res.action;
      if (action?.startsWith("add")) toast.success("Attribute added");
      else if (action?.startsWith("update")) toast.success("Attribute updated");
      else if (action?.startsWith("remove")) toast.success("Attribute removed");
      setAttrDialogOpen(false);
      setRemoveAttrDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["aaa-groups"] });
      if (selectedGroupname) queryClient.invalidateQueries({ queryKey: ["aaa-group-detail", selectedGroupname] });
    },
    onError: (err: Error) => toast.error(err.message || "Attribute operation failed"),
  });

  const [deletedGroupName, setDeletedGroupName] = useState<string | null>(null);

  const deleteGroupMutation = useMutation({
    mutationFn: (groupname: string) => {
      setDeletedGroupName(groupname);
      return apiFetch<{ success?: boolean; error?: string; deleted?: unknown }>(`/api/aaa/groups?groupname=${encodeURIComponent(groupname)}`, { method: "DELETE" });
    },
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Group '${deletedGroupName}' deleted`);
      setDeleteGroupOpen(false);
      if (selectedGroupname === deletedGroupName) {
        setSelectedGroupname(null);
        setMainTab("groups");
      }
      queryClient.invalidateQueries({ queryKey: ["aaa-groups"] });
      queryClient.invalidateQueries({ queryKey: ["aaa-group-detail"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete group"),
  });

  const cloneGroupMutation = useMutation({
    mutationFn: (body: { groupname: string; description?: string; priority?: number; checkAttrs?: unknown[]; replyAttrs?: unknown[]; speedLimitDown?: number; speedLimitUp?: number; dataLimit?: number | null; sessionTimeout?: number | null }) =>
      apiFetch<{ success?: boolean; error?: string; group?: unknown }>("/api/aaa/groups", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Group '${cloneForm.newGroupname}' cloned from '${cloneForm.sourceGroupname}'`);
      setCloneGroupOpen(false);
      queryClient.invalidateQueries({ queryKey: ["aaa-groups"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to clone group"),
  });

  // ─── Handlers ───

  function resetGroupForm() {
    setGroupForm({
      groupname: "", description: "", priority: 0,
      speedLimitDown: 0, speedLimitUp: 0,
      dataLimit: "", sessionTimeout: "",
      checkAttrs: [{ attribute: "", op: "==", value: "" }],
      replyAttrs: [{ attribute: "", op: "=", value: "" }],
    });
  }

  function openAddGroup() {
    resetGroupForm();
    setAddGroupOpen(true);
  }

  function openEditGroup(group: AAAGroup) {
    const e = group.enrichment;
    setGroupForm({
      groupname: group.groupname,
      description: e?.description || group.description || "",
      priority: e?.priority || group.priority || 0,
      speedLimitDown: e?.speedLimitDown || 0,
      speedLimitUp: e?.speedLimitUp || 0,
      dataLimit: e?.dataLimit ? String(e.dataLimit) : "",
      sessionTimeout: e?.sessionTimeout ? String(e.sessionTimeout) : "",
      checkAttrs: group.checkAttrs.length > 0
        ? group.checkAttrs.map((a) => ({ attribute: a.attribute, op: a.op, value: a.value }))
        : [{ attribute: "", op: "==", value: "" }],
      replyAttrs: group.replyAttrs.length > 0
        ? group.replyAttrs.map((a) => ({ attribute: a.attribute, op: a.op, value: a.value }))
        : [{ attribute: "", op: "=", value: "" }],
    });
    setEditGroupOpen(true);
  }

  function openCloneGroup(group: AAAGroup) {
    setCloneForm({ sourceGroupname: group.groupname, newGroupname: "" });
    setCloneGroupOpen(true);
  }

  function openViewGroup(groupname: string) {
    setSelectedGroupname(groupname);
    setDetailSubTab("check-attrs");
    setMainTab("detail");
  }

  function handleSaveGroup(isClone = false) {
    if (isClone) {
      if (!cloneForm.newGroupname.trim()) { toast.error("New group name is required"); return; }
      const srcGroup = groups.find((g) => g.groupname === cloneForm.sourceGroupname);
      const e = srcGroup?.enrichment;
      cloneGroupMutation.mutate({
        groupname: cloneForm.newGroupname.trim(),
        description: e?.description || "",
        priority: e?.priority || 0,
        speedLimitDown: e?.speedLimitDown || 0,
        speedLimitUp: e?.speedLimitUp || 0,
        dataLimit: e?.dataLimit ?? null,
        sessionTimeout: e?.sessionTimeout ?? null,
        checkAttrs: srcGroup?.checkAttrs.map((a) => ({ attribute: a.attribute, op: a.op, value: a.value })) || [],
        replyAttrs: srcGroup?.replyAttrs.map((a) => ({ attribute: a.attribute, op: a.op, value: a.value })) || [],
      });
      return;
    }

    const form = groupForm;
    if (!form.groupname.trim()) { toast.error("Group name is required"); return; }

    const checks = form.checkAttrs.filter((a) => a.attribute.trim() && a.value.trim());
    const replies = form.replyAttrs.filter((a) => a.attribute.trim() && a.value.trim());

    if (addGroupOpen) {
      // Create
      const payload: Record<string, unknown> = {
        groupname: form.groupname.trim(),
        description: form.description || undefined,
        priority: form.priority || 0,
        speedLimitDown: form.speedLimitDown || 0,
        speedLimitUp: form.speedLimitUp || 0,
        dataLimit: form.dataLimit ? Number(form.dataLimit) : null,
        sessionTimeout: form.sessionTimeout ? Number(form.sessionTimeout) : null,
      };
      if (checks.length > 0) payload.checkAttrs = checks;
      if (replies.length > 0) payload.replyAttrs = replies;
      createGroupMutation.mutate(payload as Parameters<typeof createGroupMutation.mutate>[0]);
    } else if (editGroupOpen) {
      // Update enrichment + replace attrs
      const updateOps: Promise<unknown>[] = [];

      updateOps.push(
        apiFetch("/api/aaa/groups", {
          method: "PUT",
          body: JSON.stringify({
            groupname: form.groupname,
            action: "update-enrichment",
            description: form.description,
            priority: form.priority,
            speedLimitDown: form.speedLimitDown || 0,
            speedLimitUp: form.speedLimitUp || 0,
            dataLimit: form.dataLimit ? Number(form.dataLimit) : null,
            sessionTimeout: form.sessionTimeout ? Number(form.sessionTimeout) : null,
          }),
        }).then((r) => {
          if (r.error) throw new Error(r.error);
          return r;
        })
      );

      if (checks.length > 0) {
        updateOps.push(
          apiFetch("/api/aaa/groups", {
            method: "PUT",
            body: JSON.stringify({
              groupname: form.groupname,
              action: "replace-checks",
              checkAttrs: checks,
            }),
          }).then((r) => { if (r.error) throw new Error(r.error); return r; })
        );
      }

      if (replies.length > 0) {
        updateOps.push(
          apiFetch("/api/aaa/groups", {
            method: "PUT",
            body: JSON.stringify({
              groupname: form.groupname,
              action: "replace-replies",
              replyAttrs: replies,
            }),
          }).then((r) => { if (r.error) throw new Error(r.error); return r; })
        );
      }

      Promise.all(updateOps)
        .then(() => {
          toast.success(`Group '${form.groupname}' updated successfully`);
          setEditGroupOpen(false);
          queryClient.invalidateQueries({ queryKey: ["aaa-groups"] });
          if (selectedGroupname) queryClient.invalidateQueries({ queryKey: ["aaa-group-detail", selectedGroupname] });
        })
        .catch((err) => toast.error(err.message || "Failed to update group"));
    }
  }

  function openAddAttr(type: "check" | "reply") {
    setAttrDialogMode(type === "check" ? "add-check" : "add-reply");
    setAttrDialogData({ attribute: "", op: type === "check" ? "==" : "=", value: "" });
    setAttrDialogOpen(true);
  }

  function openEditAttr(type: "check" | "reply", attr: RadiusAttr) {
    setAttrDialogMode(type === "check" ? "edit-check" : "edit-reply");
    setAttrDialogData({ id: attr.id, attribute: attr.attribute, op: attr.op, value: attr.value });
    setAttrDialogOpen(true);
  }

  function handleSaveAttr() {
    if (!attrDialogData.attribute.trim()) { toast.error("Attribute name is required"); return; }
    if (!attrDialogData.value.trim() && attrDialogData.value !== "0") { toast.error("Value is required"); return; }
    if (!selectedGroupname) return;

    const mode = attrDialogMode;
    if (mode === "add-check" || mode === "add-reply") {
      const action = mode === "add-check" ? "add-check" : "add-reply";
      attrMutation.mutate({
        groupname: selectedGroupname,
        action,
        attribute: attrDialogData.attribute.trim(),
        op: attrDialogData.op,
        value: attrDialogData.value.trim(),
      });
    } else if (mode === "edit-check" || mode === "edit-reply") {
      const action = mode === "edit-check" ? "update-check" : "update-reply";
      attrMutation.mutate({
        groupname: selectedGroupname,
        action,
        id: attrDialogData.id,
        newAttribute: attrDialogData.attribute.trim(),
        newOp: attrDialogData.op,
        newValue: attrDialogData.value.trim(),
      });
    }
  }

  function openRemoveAttr(type: "check" | "reply", attr: RadiusAttr) {
    setRemoveAttrTarget({ id: attr.id, type, attribute: attr.attribute });
    setRemoveAttrDialogOpen(true);
  }

  function handleRemoveAttr() {
    if (!selectedGroupname || !removeAttrTarget) return;
    const action = removeAttrTarget.type === "check" ? "remove-check" : "remove-reply";
    attrMutation.mutate({
      groupname: selectedGroupname,
      action,
      id: removeAttrTarget.id,
    });
  }

  function updateGroupFormAttr(
    section: "checkAttrs" | "replyAttrs",
    index: number,
    field: "attribute" | "op" | "value",
    val: string
  ) {
    setGroupForm((prev) => {
      const arr = [...prev[section]];
      arr[index] = { ...arr[index], [field]: val };
      return { ...prev, [section]: arr };
    });
  }

  function addGroupFormAttrRow(section: "checkAttrs" | "replyAttrs") {
    setGroupForm((prev) => ({
      ...prev,
      [section]: [...prev[section], { attribute: "", op: section === "checkAttrs" ? "==" : "=", value: "" }],
    }));
  }

  function removeGroupFormAttrRow(section: "checkAttrs" | "replyAttrs", index: number) {
    setGroupForm((prev) => {
      const arr = [...prev[section]];
      arr.splice(index, 1);
      return { ...prev, [section]: arr.length > 0 ? arr : [{ attribute: "", op: section === "checkAttrs" ? "==" : "=", value: "" }] };
    });
  }

  function quickAddAttr(section: "checkAttrs" | "replyAttrs", attrName: string) {
    setGroupForm((prev) => {
      const arr = [...prev[section]];
      const exists = arr.some((a) => a.attribute === attrName);
      if (exists) {
        toast.info(`'${attrName}' already in the list`);
        return prev;
      }
      arr.push({ attribute: attrName, op: section === "checkAttrs" ? "==" : "=", value: "" });
      return { ...prev, [section]: arr };
    });
  }

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    setPage(1);
  }, []);

  // ─── Loading skeleton ───
  if (groupsLoading && !groupsData) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="skeleton-wave h-10 w-full" />
        <Skeleton className="skeleton-wave h-96 rounded-xl" />
      </div>
    );
  }

  // ─── Render ───
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <PageHeader
        title="AAA Groups & Policies"
        description="FreeRADIUS group management — define plans, bandwidth policies, and access controls."
        icon={Shield}
        breadcrumbs={[
          { label: "AAA" },
          { label: "Groups & Policies" },
        ]}
      />

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="groups" className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />Groups
          </TabsTrigger>
          <TabsTrigger value="detail" className="flex items-center gap-1.5" disabled={!selectedGroupname}>
            <Server className="h-3.5 w-3.5" />
            {selectedGroupname ? (
              <span className="font-mono text-xs">{selectedGroupname}</span>
            ) : (
              "Group Detail"
            )}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* GROUPS TAB                                                */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="groups" className="space-y-5">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-0 rounded-xl ring-1 ring-red-200/60 dark:ring-red-800/40 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/20 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-sm shadow-red-500/25">
                    <Layers className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-foreground">{stats.totalGroups}</p>
                    <p className="text-xs text-muted-foreground font-medium">Total Groups</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 rounded-xl ring-1 ring-emerald-200/60 dark:ring-emerald-800/40 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/20 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm shadow-emerald-500/25">
                    <Settings2 className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-foreground">{totalPolicies}</p>
                    <p className="text-xs text-muted-foreground font-medium">Total Policies</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 rounded-xl ring-1 ring-amber-200/60 dark:ring-amber-800/40 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/20 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm shadow-amber-500/25">
                    <Users className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-foreground">{stats.totalUsersAcrossGroups}</p>
                    <p className="text-xs text-muted-foreground font-medium">Assigned Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 rounded-xl ring-1 ring-cyan-200/60 dark:ring-cyan-800/40 bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-950/40 dark:to-sky-950/20 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 shadow-sm shadow-cyan-500/25">
                    <Gauge className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-foreground">{avgUsersPerGroup}</p>
                    <p className="text-xs text-muted-foreground font-medium">Avg Users/Group</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters + Add Button */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search groups by name..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button className="bg-red-600 hover:bg-red-700 text-white shrink-0" onClick={openAddGroup}>
              <Plus className="h-4 w-4 mr-2" />Add Group
            </Button>
          </div>

          {/* Groups Table */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Group Name</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Description</TableHead>
                      <TableHead className="text-xs text-center">Users</TableHead>
                      <TableHead className="text-xs text-center hidden lg:table-cell">Check Attrs</TableHead>
                      <TableHead className="text-xs text-center hidden lg:table-cell">Reply Attrs</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">Speed</TableHead>
                      <TableHead className="text-xs text-center hidden md:table-cell">Priority</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-16">
                          <div className="flex flex-col items-center gap-2">
                            <Layers className="h-10 w-10 text-muted-foreground/30" />
                            <p className="text-muted-foreground text-sm">
                              {search ? "No groups match your search." : "No groups configured yet."}
                            </p>
                            {!search && (
                              <Button
                                size="sm"
                                className="bg-red-600 hover:bg-red-700 text-white mt-2"
                                onClick={openAddGroup}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1.5" />Create First Group
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      groups.map((group) => {
                        const e = group.enrichment;
                        const speedDown = e?.speedLimitDown || 0;
                        const speedUp = e?.speedLimitUp || 0;

                        return (
                          <TableRow
                            key={group.groupname}
                            className="hover:bg-muted/50 cursor-pointer transition-colors duration-150"
                            onClick={() => openViewGroup(group.groupname)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-foreground">
                                  {group.groupname}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                                {e?.description || group.description || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant={group.userCount > 0 ? "default" : "secondary"}
                                className="text-xs tabular-nums"
                              >
                                {group.userCount}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center hidden lg:table-cell">
                              <Badge variant="outline" className="text-xs tabular-nums border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                                {group.checkCount}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center hidden lg:table-cell">
                              <Badge variant="outline" className="text-xs tabular-nums border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
                                {group.replyCount}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {(speedDown > 0 || speedUp > 0) ? (
                                <div className="flex items-center gap-1 text-xs tabular-nums">
                                  <span className="text-green-600 dark:text-green-400">↓{speedDown}</span>
                                  <span className="text-muted-foreground">/</span>
                                  <span className="text-teal-600 dark:text-teal-400">↑{speedUp}</span>
                                  <span className="text-muted-foreground">Mbps</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center hidden md:table-cell">
                              <span className="text-xs tabular-nums">{e?.priority || group.priority || 0}</span>
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openViewGroup(group.groupname)}>
                                    <Eye className="h-4 w-4 mr-2" />View Detail
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openEditGroup(group)}>
                                    <Edit className="h-4 w-4 mr-2" />Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openCloneGroup(group)}>
                                    <Copy className="h-4 w-4 mr-2" />Clone
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    onClick={() => {
                                      deleteGroupMutation.mutate(group.groupname);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {(pagination.page - 1) * pagination.limit + 1}
                    –{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline" size="sm" className="h-7 text-xs"
                      disabled={pagination.page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Prev
                    </Button>
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      const start = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
                      const p = start + i;
                      if (p > pagination.totalPages) return null;
                      return (
                        <Button
                          key={p}
                          variant={p === pagination.page ? "default" : "outline"}
                          size="sm" className="h-7 w-7 text-xs"
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </Button>
                      );
                    })}
                    {pagination.totalPages > 5 && pagination.page < pagination.totalPages - 2 && (
                      <span className="text-xs text-muted-foreground self-center px-1">...</span>
                    )}
                    <Button
                      variant="outline" size="sm" className="h-7 text-xs"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* GROUP DETAIL TAB                                          */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="detail" className="space-y-5">
          {/* Back Button */}
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setMainTab("groups")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />Back to Groups
          </Button>

          {detailLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 rounded-xl" />
              <div className="grid grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
              <Skeleton className="h-64 rounded-xl" />
            </div>
          ) : !groupDetail?.group ? (
            <Card className="border">
              <CardContent className="py-16 text-center">
                <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">Group not found or could not be loaded.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Group Header */}
              <Card className="border shadow-sm">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0">
                        <Shield className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-xl font-bold font-mono text-foreground">
                            {groupDetail.group.groupname}
                          </h2>
                          <Badge variant="secondary" className="text-xs">
                            <Users className="h-3 w-3 mr-1" />
                            {groupDetail.group.userCount} user{groupDetail.group.userCount !== 1 ? "s" : ""}
                          </Badge>
                          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                            {groupDetail.group.checkCount} check
                          </Badge>
                          <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
                            {groupDetail.group.replyCount} reply
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {groupDetail.group.enrichment?.description || groupDetail.group.description || "No description"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => {
                        const g = groups.find((g) => g.groupname === selectedGroupname);
                        if (g) openEditGroup(g);
                      }}>
                        <Edit className="h-3.5 w-3.5 mr-1.5" />Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        const g = groups.find((g) => g.groupname === selectedGroupname);
                        if (g) openCloneGroup(g);
                      }}>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />Clone
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => {
                          setDeleteGroupOpen(true);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
                      </Button>
                    </div>
                  </div>

                  {/* Enrichment Info Row */}
                  {(groupDetail.group.enrichment?.speedLimitDown || groupDetail.group.enrichment?.speedLimitUp ||
                    groupDetail.group.enrichment?.dataLimit || groupDetail.group.enrichment?.sessionTimeout) && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {groupDetail.group.enrichment?.speedLimitDown !== undefined && groupDetail.group.enrichment?.speedLimitDown > 0 && (
                          <div className="flex items-center gap-2">
                            <Gauge className="h-4 w-4 text-green-600" />
                            <div>
                              <p className="text-xs text-muted-foreground">Download</p>
                              <p className="text-sm font-semibold tabular-nums">{groupDetail.group.enrichment.speedLimitDown} Mbps</p>
                            </div>
                          </div>
                        )}
                        {groupDetail.group.enrichment?.speedLimitUp !== undefined && groupDetail.group.enrichment?.speedLimitUp > 0 && (
                          <div className="flex items-center gap-2">
                            <Gauge className="h-4 w-4 text-teal-600" />
                            <div>
                              <p className="text-xs text-muted-foreground">Upload</p>
                              <p className="text-sm font-semibold tabular-nums">{groupDetail.group.enrichment.speedLimitUp} Mbps</p>
                            </div>
                          </div>
                        )}
                        {groupDetail.group.enrichment?.dataLimit && (
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-amber-600" />
                            <div>
                              <p className="text-xs text-muted-foreground">Data Limit</p>
                              <p className="text-sm font-semibold tabular-nums">{groupDetail.group.enrichment.dataLimit} GB</p>
                            </div>
                          </div>
                        )}
                        {groupDetail.group.enrichment?.sessionTimeout && (
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-purple-600" />
                            <div>
                              <p className="text-xs text-muted-foreground">Session Timeout</p>
                              <p className="text-sm font-semibold tabular-nums">{formatDuration(groupDetail.group.enrichment.sessionTimeout)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Session Stats Cards */}
              {groupDetail.group.sessionStats && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <Card className="border-0 rounded-xl ring-1 ring-emerald-200/60 dark:ring-emerald-800/40 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/20">
                    <CardContent className="p-3">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Active Sessions</p>
                      <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{groupDetail.group.sessionStats.activeSessions}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 rounded-xl ring-1 ring-red-200/60 dark:ring-red-800/40 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/20">
                    <CardContent className="p-3">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Total Sessions</p>
                      <p className="text-lg font-bold tabular-nums text-red-700 dark:text-red-300">{groupDetail.group.sessionStats.totalSessions}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 rounded-xl ring-1 ring-amber-200/60 dark:ring-amber-800/40 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/20">
                    <CardContent className="p-3">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Total Data</p>
                      <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-300">{groupDetail.group.sessionStats.totalDataGB} GB</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 rounded-xl ring-1 ring-cyan-200/60 dark:ring-cyan-800/40 bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-950/40 dark:to-sky-950/20">
                    <CardContent className="p-3">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Download</p>
                      <p className="text-lg font-bold tabular-nums text-cyan-700 dark:text-cyan-300">{groupDetail.group.sessionStats.totalDownloadGB} GB</p>
                    </CardContent>
                  </Card>
                  <Card className="border-0 rounded-xl ring-1 ring-purple-200/60 dark:ring-purple-800/40 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/40 dark:to-violet-950/20">
                    <CardContent className="p-3">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Uptime</p>
                      <p className="text-lg font-bold tabular-nums text-purple-700 dark:text-purple-300">{groupDetail.group.sessionStats.totalSessionHours}h</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Detail Sub-Tabs */}
              <Tabs value={detailSubTab} onValueChange={setDetailSubTab} className="space-y-4">
                <TabsList className="flex-wrap">
                  <TabsTrigger value="check-attrs" className="flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Check Attributes
                    <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{groupDetail.group.checkCount}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="reply-attrs" className="flex items-center gap-1.5 text-xs">
                    <Zap className="h-3.5 w-3.5" />
                    Reply Attributes
                    <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{groupDetail.group.replyCount}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="assigned-users" className="flex items-center gap-1.5 text-xs">
                    <Users className="h-3.5 w-3.5" />
                    Assigned Users
                    <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{groupDetail.group.assignedUsers?.length || 0}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="sessions" className="flex items-center gap-1.5 text-xs">
                    <Activity className="h-3.5 w-3.5" />
                    Sessions
                  </TabsTrigger>
                </TabsList>

                {/* ─── Check Attributes Sub-tab ─── */}
                <TabsContent value="check-attrs" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      radgroupcheck — authentication and authorization control attributes.
                    </p>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => openAddAttr("check")}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" />Add Check Attribute
                    </Button>
                  </div>
                  <Card className="border shadow-sm">
                    <CardContent className="p-0">
                      <div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-16">ID</TableHead>
                              <TableHead className="text-xs">Attribute</TableHead>
                              <TableHead className="text-xs w-20">Operator</TableHead>
                              <TableHead className="text-xs">Value</TableHead>
                              <TableHead className="text-xs text-right w-24">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {groupDetail.group.checkAttrs.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                                  No check attributes defined. Click &quot;Add Check Attribute&quot; to add one.
                                </TableCell>
                              </TableRow>
                            ) : (
                              groupDetail.group.checkAttrs.map((attr) => (
                                <TableRow key={attr.id} className="hover:bg-muted/50">
                                  <TableCell className="text-xs tabular-nums text-muted-foreground">{attr.id}</TableCell>
                                  <TableCell>
                                    <span className="font-mono text-xs font-medium">{attr.attribute}</span>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px] font-mono">{attr.op}</Badge>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs">{attr.value}</span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditAttr("check", attr)}>
                                        <Edit className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => openRemoveAttr("check", attr)}>
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
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ─── Reply Attributes Sub-tab ─── */}
                <TabsContent value="reply-attrs" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      radgroupreply — reply and bandwidth policy attributes sent to NAS.
                    </p>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => openAddAttr("reply")}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" />Add Reply Attribute
                    </Button>
                  </div>
                  <Card className="border shadow-sm">
                    <CardContent className="p-0">
                      <div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-16">ID</TableHead>
                              <TableHead className="text-xs">Attribute</TableHead>
                              <TableHead className="text-xs w-20">Operator</TableHead>
                              <TableHead className="text-xs">Value</TableHead>
                              <TableHead className="text-xs text-right w-24">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {groupDetail.group.replyAttrs.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                                  No reply attributes defined. Click &quot;Add Reply Attribute&quot; to add one.
                                </TableCell>
                              </TableRow>
                            ) : (
                              groupDetail.group.replyAttrs.map((attr) => (
                                <TableRow key={attr.id} className="hover:bg-muted/50">
                                  <TableCell className="text-xs tabular-nums text-muted-foreground">{attr.id}</TableCell>
                                  <TableCell>
                                    <span className="font-mono text-xs font-medium">{attr.attribute}</span>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px] font-mono">{attr.op}</Badge>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs">{attr.value}</span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditAttr("reply", attr)}>
                                        <Edit className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => openRemoveAttr("reply", attr)}>
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
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ─── Assigned Users Sub-tab ─── */}
                <TabsContent value="assigned-users" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Subscribers assigned to this group via radusergroup.
                  </p>
                  <Card className="border shadow-sm">
                    <CardContent className="p-0">
                      <div className="max-h-96 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Username</TableHead>
                              <TableHead className="text-xs hidden sm:table-cell">Subscriber Name</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs hidden md:table-cell">Plan</TableHead>
                              <TableHead className="text-xs text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(!groupDetail.group.assignedUsers || groupDetail.group.assignedUsers.length === 0) ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                                  No users assigned to this group.
                                </TableCell>
                              </TableRow>
                            ) : (
                              groupDetail.group.assignedUsers.map((user) => (
                                <TableRow key={user.username} className="hover:bg-muted/50">
                                  <TableCell>
                                    <span className="font-mono text-xs font-medium">{user.username}</span>
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell">
                                    <div className="text-xs">
                                      {user.subscriberName || "—"}
                                      {user.subscriberCode && (
                                        <span className="text-muted-foreground ml-1.5">({user.subscriberCode})</span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        user.subscriberStatus === "ACTIVE" ? "default" :
                                        user.subscriberStatus === "SUSPENDED" ? "destructive" : "secondary"
                                      }
                                      className="text-[10px]"
                                    >
                                      {user.subscriberStatus || "UNKNOWN"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="hidden md:table-cell">
                                    <span className="text-xs">{user.planName || "—"}</span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700"
                                      disabled
                                      title="Remove user from group"
                                    >
                                      <UserMinus className="h-3.5 w-3.5 mr-1" />Remove
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ─── Sessions Sub-tab ─── */}
                <TabsContent value="sessions" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Aggregate session statistics for all users in this group.
                  </p>
                  <Card className="border shadow-sm">
                    <CardContent className="p-5">
                      {groupDetail.group.sessionStats ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Total Sessions</p>
                            <p className="text-2xl font-bold tabular-nums">{groupDetail.group.sessionStats.totalSessions}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Currently Active</p>
                            <p className="text-2xl font-bold tabular-nums text-green-600">{groupDetail.group.sessionStats.activeSessions}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Total Session Time</p>
                            <p className="text-2xl font-bold tabular-nums">{formatDuration(groupDetail.group.sessionStats.totalSessionSeconds)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Total Download</p>
                            <p className="text-2xl font-bold tabular-nums text-cyan-600">{groupDetail.group.sessionStats.totalDownloadGB} GB</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Total Upload</p>
                            <p className="text-2xl font-bold tabular-nums text-teal-600">{groupDetail.group.sessionStats.totalUploadGB} GB</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Total Data Transfer</p>
                            <p className="text-2xl font-bold tabular-nums text-amber-600">{groupDetail.group.sessionStats.totalDataGB} GB</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-8">No session data available.</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DIALOGS                                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* ─── Add/Edit Group Dialog ─── */}
      <Dialog open={addGroupOpen || editGroupOpen} onOpenChange={(open) => {
        if (!open) { setAddGroupOpen(false); setEditGroupOpen(false); }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{addGroupOpen ? "Create New Group" : `Edit Group: ${groupForm.groupname}`}</DialogTitle>
            <DialogDescription>
              {addGroupOpen
                ? "Define a new FreeRADIUS group with authentication and bandwidth policies."
                : "Update group enrichment and RADIUS attributes."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Basic Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Basic Information</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="groupname" className="text-xs">Group Name</Label>
                  <Input
                    id="groupname"
                    placeholder="e.g. ftth-100mbps"
                    value={groupForm.groupname}
                    onChange={(e) => setGroupForm((p) => ({ ...p, groupname: e.target.value }))}
                    disabled={!!editGroupOpen}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="priority" className="text-xs">Priority</Label>
                  <Input
                    id="priority"
                    type="number"
                    placeholder="0"
                    value={groupForm.priority}
                    onChange={(e) => setGroupForm((p) => ({ ...p, priority: parseInt(e.target.value) || 0 }))}
                    className="text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe this group/policy..."
                  value={groupForm.description}
                  onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
            </div>

            <Separator />

            {/* Speed & Limits */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Speed & Limits</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Gauge className="h-3 w-3 text-green-600" />Download (Mbps)
                  </Label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={groupForm.speedLimitDown}
                    onChange={(e) => setGroupForm((p) => ({ ...p, speedLimitDown: parseInt(e.target.value) || 0 }))}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Gauge className="h-3 w-3 text-teal-600" />Upload (Mbps)
                  </Label>
                  <Input
                    type="number"
                    placeholder="50"
                    value={groupForm.speedLimitUp}
                    onChange={(e) => setGroupForm((p) => ({ ...p, speedLimitUp: parseInt(e.target.value) || 0 }))}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Database className="h-3 w-3 text-amber-600" />Data Limit (GB)
                  </Label>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    value={groupForm.dataLimit}
                    onChange={(e) => setGroupForm((p) => ({ ...p, dataLimit: e.target.value }))}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Clock className="h-3 w-3 text-purple-600" />Session Timeout (s)
                  </Label>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    value={groupForm.sessionTimeout}
                    onChange={(e) => setGroupForm((p) => ({ ...p, sessionTimeout: e.target.value }))}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Check Attributes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Check Attributes (radgroupcheck)</h4>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addGroupFormAttrRow("checkAttrs")}>
                  <Plus className="h-3 w-3 mr-1" />Add Row
                </Button>
              </div>
              {/* Quick-add buttons */}
              <div className="flex flex-wrap gap-1.5">
                {COMMON_CHECK_ATTRS.map((attr) => (
                  <Button
                    key={attr}
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 font-mono"
                    onClick={() => quickAddAttr("checkAttrs", attr)}
                  >
                    + {attr}
                  </Button>
                ))}
              </div>
              {groupForm.checkAttrs.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <Input
                      placeholder="Attribute"
                      value={row.attribute}
                      onChange={(e) => updateGroupFormAttr("checkAttrs", idx, "attribute", e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <Select value={row.op} onValueChange={(v) => updateGroupFormAttr("checkAttrs", idx, "op", v)}>
                      <SelectTrigger className="h-8 text-xs font-mono w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHECK_OPS.map((op) => (
                          <SelectItem key={op} value={op} className="text-xs font-mono">{op}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Input
                      placeholder="Value"
                      value={row.value}
                      onChange={(e) => updateGroupFormAttr("checkAttrs", idx, "value", e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-red-500"
                      onClick={() => removeGroupFormAttrRow("checkAttrs", idx)}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            {/* Reply Attributes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Reply Attributes (radgroupreply)</h4>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addGroupFormAttrRow("replyAttrs")}>
                  <Plus className="h-3 w-3 mr-1" />Add Row
                </Button>
              </div>
              {/* Quick-add buttons */}
              <div className="flex flex-wrap gap-1.5">
                {COMMON_REPLY_ATTRS.map((attr) => (
                  <Button
                    key={attr}
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 font-mono"
                    onClick={() => quickAddAttr("replyAttrs", attr)}
                  >
                    + {attr}
                  </Button>
                ))}
              </div>
              {groupForm.replyAttrs.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <Input
                      placeholder="Attribute"
                      value={row.attribute}
                      onChange={(e) => updateGroupFormAttr("replyAttrs", idx, "attribute", e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <Select value={row.op} onValueChange={(v) => updateGroupFormAttr("replyAttrs", idx, "op", v)}>
                      <SelectTrigger className="h-8 text-xs font-mono w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REPLY_OPS.map((op) => (
                          <SelectItem key={op} value={op} className="text-xs font-mono">{op}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Input
                      placeholder="Value"
                      value={row.value}
                      onChange={(e) => updateGroupFormAttr("replyAttrs", idx, "value", e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-red-500"
                      onClick={() => removeGroupFormAttrRow("replyAttrs", idx)}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddGroupOpen(false); setEditGroupOpen(false); }}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => handleSaveGroup(false)}
              disabled={createGroupMutation.isPending}
            >
              {createGroupMutation.isPending ? "Saving..." : addGroupOpen ? "Create Group" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Clone Group Dialog ─── */}
      <Dialog open={cloneGroupOpen} onOpenChange={setCloneGroupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clone Group</DialogTitle>
            <DialogDescription>
              Create a copy of an existing group with all its attributes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Copy From</Label>
              <Input value={cloneForm.sourceGroupname} disabled className="font-mono text-sm bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clone-name" className="text-xs">New Group Name</Label>
              <Input
                id="clone-name"
                placeholder="Enter new group name..."
                value={cloneForm.newGroupname}
                onChange={(e) => setCloneForm((p) => ({ ...p, newGroupname: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneGroupOpen(false)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => handleSaveGroup(true)}
              disabled={cloneGroupMutation.isPending}
            >
              {cloneGroupMutation.isPending ? "Cloning..." : "Clone Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Group Confirmation ─── */}
      <AlertDialog open={deleteGroupOpen} onOpenChange={setDeleteGroupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete group <span className="font-mono font-semibold">{selectedGroupname}</span>?
              This will remove all check attributes, reply attributes, and user assignments from the RADIUS database.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (selectedGroupname) deleteGroupMutation.mutate(selectedGroupname);
              }}
              disabled={deleteGroupMutation.isPending}
            >
              {deleteGroupMutation.isPending ? "Deleting..." : "Delete Group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Add/Edit Attribute Dialog ─── */}
      <Dialog open={attrDialogOpen} onOpenChange={setAttrDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {attrDialogMode === "add-check" && "Add Check Attribute"}
              {attrDialogMode === "add-reply" && "Add Reply Attribute"}
              {attrDialogMode === "edit-check" && "Edit Check Attribute"}
              {attrDialogMode === "edit-reply" && "Edit Reply Attribute"}
            </DialogTitle>
            <DialogDescription>
              {attrDialogMode.startsWith("add") ? "Add a new RADIUS attribute to this group." : "Modify this RADIUS attribute."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Common attribute quick-select */}
            {(attrDialogMode === "add-check" || attrDialogMode === "add-reply") && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Quick Select</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(attrDialogMode === "add-check" ? COMMON_CHECK_ATTRS : COMMON_REPLY_ATTRS).map((attr) => (
                    <Button
                      key={attr}
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 font-mono"
                      onClick={() => setAttrDialogData((p) => ({ ...p, attribute: attr }))}
                    >
                      {attr}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Attribute</Label>
              <Input
                placeholder="e.g. Auth-Type"
                value={attrDialogData.attribute}
                onChange={(e) => setAttrDialogData((p) => ({ ...p, attribute: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Operator</Label>
              <Select value={attrDialogData.op} onValueChange={(v) => setAttrDialogData((p) => ({ ...p, op: v }))}>
                <SelectTrigger className="w-full font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(attrDialogMode.includes("check") ? CHECK_OPS : REPLY_OPS).map((op) => (
                    <SelectItem key={op} value={op} className="font-mono text-sm">{op}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Value</Label>
              <Input
                placeholder="e.g. Accept, 86400, 100M/50M"
                value={attrDialogData.value}
                onChange={(e) => setAttrDialogData((p) => ({ ...p, value: e.target.value }))}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttrDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleSaveAttr}
              disabled={attrMutation.isPending}
            >
              {attrMutation.isPending ? "Saving..." : attrDialogMode.startsWith("add") ? "Add Attribute" : "Update Attribute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Remove Attribute Confirmation ─── */}
      <AlertDialog open={removeAttrDialogOpen} onOpenChange={setRemoveAttrDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Attribute</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <span className="font-mono font-semibold">{removeAttrTarget?.attribute}</span> ({removeAttrTarget?.type}) from this group?
              This may affect authentication or bandwidth policies for all users in this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleRemoveAttr}
              disabled={attrMutation.isPending}
            >
              {attrMutation.isPending ? "Removing..." : "Remove Attribute"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Re-export Activity icon for the sessions tab
function Activity({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  );
}
