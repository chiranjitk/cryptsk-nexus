"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Shield, ShieldCheck, ShieldAlert, Lock, Unlock, Plus, Trash2, Eye,
  RefreshCw, AlertTriangle, CheckCircle, XCircle, Network, Wifi,
  Loader2, Edit, WifiOff, Users, BarChart3, Activity, Clock, FileWarning,
  ShieldOff, Radar, Cpu, Zap, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────
interface SecurityProfile {
  id: string;
  name: string;
  description?: string;
  arpProtection: boolean;
  arpAction?: "DROP" | "REJECT";
  dhcpSnooping: boolean;
  dhcpTrustedPorts?: string[];
  clientIsolation: boolean;
  isolatedInterfaces?: string[];
  portSecurity: boolean;
  maxMacPerPort?: number;
  stormControl: boolean;
  stormBpsLimit?: number;
  stormPpsLimit?: number;
  interfaceName?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface SecurityStats {
  totalProfiles: number;
  activeFeatures: number;
  arpProtection: number;
  clientIsolation: number;
}

interface SecurityProfilesResponse {
  profiles: SecurityProfile[];
  stats: SecurityStats;
}

interface FeatureDetail {
  name: string;
  description: string;
  status: "active" | "inactive" | "partial";
  affectedInterfaces: string[];
  details: string[];
}

interface SecurityLog {
  id: string;
  timestamp: string;
  action: string;
  entity: string;
  entityName: string;
  interfaceName?: string;
  details: string;
  severity: "info" | "warning" | "error" | "critical";
}

interface FeaturesResponse {
  features: FeatureDetail[];
}

interface SecurityLogsResponse {
  logs: SecurityLog[];
}

// ─── Constants ────────────────────────────────────────────────────
const DEFAULT_FORM: Omit<SecurityProfile, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  description: "",
  arpProtection: false,
  arpAction: "DROP",
  dhcpSnooping: false,
  dhcpTrustedPorts: [],
  clientIsolation: false,
  isolatedInterfaces: [],
  portSecurity: false,
  maxMacPerPort: 2,
  stormControl: false,
  stormBpsLimit: 1000000,
  stormPpsLimit: 1000,
  interfaceName: "",
  enabled: true,
};

const FEATURE_BORDER_COLORS: Record<string, string> = {
  "ARP Protection": "border-l-4 border-l-emerald-500",
  "DHCP Snooping": "border-l-4 border-l-teal-500",
  "Client Isolation": "border-l-4 border-l-amber-500",
  "Port Security": "border-l-4 border-l-red-500",
  "Storm Control": "border-l-4 border-l-purple-500",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 rounded-full border-0",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full border-0",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full border-0",
  critical: "bg-red-600 text-white dark:bg-red-700 rounded-full border-0",
};

// ─── StatCard ─────────────────────────────────────────────────────
function StatCard({
  title, value, subtitle, icon: Icon, gradient, delay,
}: {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; gradient: string; delay: number;
}) {
  return (
    <Card className={`${gradient} border-0 shadow-lg animate-card-enter`} style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">{title}</p>
            <p className="text-2xl font-bold mt-2 tabular-nums">{value}</p>
            <p className="text-xs mt-1 opacity-75">{subtitle}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── FeatureStatusDot ────────────────────────────────────────────
function FeatureStatusDot({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        ON
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      OFF
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function SecurityPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("profiles");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog state
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<SecurityProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SecurityProfile | null>(null);
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [profileForm, setProfileForm] = useState(DEFAULT_FORM);
  const [trustedPortsInput, setTrustedPortsInput] = useState("");
  const [isolatedIfacesInput, setIsolatedIfacesInput] = useState("");

  // ─── Queries ─────────────────────────────────────────────────
  const {
    data: profilesData, isLoading: profilesLoading, refetch: refetchProfiles,
  } = useQuery<SecurityProfilesResponse>({
    queryKey: ["security-profiles"],
    queryFn: () => apiFetch<SecurityProfilesResponse>("/api/security?section=profiles"),
    refetchInterval: 30000,
  });

  const {
    data: featuresData, isLoading: featuresLoading, refetch: refetchFeatures,
  } = useQuery<FeaturesResponse>({
    queryKey: ["security-features"],
    queryFn: () => apiFetch<FeaturesResponse>("/api/security?section=features"),
    refetchInterval: 30000,
    enabled: tab === "features",
  });

  const {
    data: logsData, isLoading: logsLoading, refetch: refetchLogs,
  } = useQuery<SecurityLogsResponse>({
    queryKey: ["security-logs"],
    queryFn: () => apiFetch<SecurityLogsResponse>("/api/security?section=logs"),
    refetchInterval: 30000,
    enabled: tab === "logs",
  });

  const profiles = profilesData?.profiles || [];
  const stats = profilesData?.stats || {
    totalProfiles: 0, activeFeatures: 0, arpProtection: 0, clientIsolation: 0,
  };

  const features = featuresData?.features || [];
  const logs = logsData?.logs || [];

  const filteredProfiles = profiles.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.interfaceName || "").toLowerCase().includes(q)
    );
  });

  // ─── Mutations ───────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/security", {
        method: "POST",
        body: JSON.stringify({ action: "create", ...body }),
      }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("Security profile created successfully");
        setProfileDialogOpen(false);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ["security-profiles"] });
      } else {
        toast.error(d.error || "Failed to create profile");
      }
    },
    onError: () => toast.error("Failed to create security profile"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; [key: string]: unknown }) =>
      apiFetch("/api/security", {
        method: "PUT",
        body: JSON.stringify({ id, ...payload }),
      }),
    onSuccess: (d: any) => {
      if (d.success || d.id) {
        toast.success("Security profile updated");
        setProfileDialogOpen(false);
        setEditingProfile(null);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ["security-profiles"] });
      } else {
        toast.error(d.error || "Failed to update profile");
      }
    },
    onError: () => toast.error("Failed to update security profile"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/security?id=${id}`, { method: "DELETE" }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("Security profile deleted");
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: ["security-profiles"] });
      } else {
        toast.error(d.error || "Failed to delete");
      }
    },
    onError: () => toast.error("Failed to delete security profile"),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/security", {
        method: "POST",
        body: JSON.stringify({ action: "apply" }),
      }),
    onSuccess: (d: any) => {
      if (d.success) {
        toast.success("All active security profiles applied successfully");
        setApplyConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ["security-features"] });
      } else {
        toast.error(d.error || "Failed to apply security profiles");
      }
    },
    onError: () => toast.error("Failed to apply security profiles"),
  });

  // ─── Helpers ─────────────────────────────────────────────────
  function resetForm() {
    setProfileForm(DEFAULT_FORM);
    setTrustedPortsInput("");
    setIsolatedIfacesInput("");
    setEditingProfile(null);
  }

  function openDialog(profile?: SecurityProfile) {
    if (profile) {
      setEditingProfile(profile);
      setProfileForm({
        name: profile.name,
        description: profile.description || "",
        arpProtection: profile.arpProtection,
        arpAction: profile.arpAction || "DROP",
        dhcpSnooping: profile.dhcpSnooping,
        dhcpTrustedPorts: profile.dhcpTrustedPorts || [],
        clientIsolation: profile.clientIsolation,
        isolatedInterfaces: profile.isolatedInterfaces || [],
        portSecurity: profile.portSecurity,
        maxMacPerPort: profile.maxMacPerPort || 2,
        stormControl: profile.stormControl,
        stormBpsLimit: profile.stormBpsLimit || 1000000,
        stormPpsLimit: profile.stormPpsLimit || 1000,
        interfaceName: profile.interfaceName || "",
        enabled: profile.enabled,
      });
      setTrustedPortsInput((profile.dhcpTrustedPorts || []).join(", "));
      setIsolatedIfacesInput((profile.isolatedInterfaces || []).join(", "));
    } else {
      resetForm();
    }
    setProfileDialogOpen(true);
  }

  function handleSave() {
    if (!profileForm.name.trim()) {
      toast.error("Profile name is required");
      return;
    }
    const finalForm = {
      ...profileForm,
      dhcpTrustedPorts: trustedPortsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      isolatedInterfaces: isolatedIfacesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    if (editingProfile) {
      updateMutation.mutate({ id: editingProfile.id, ...finalForm });
    } else {
      createMutation.mutate(finalForm);
    }
  }

  function formatBps(bps?: number): string {
    if (!bps) return "—";
    if (bps >= 1000000000) return `${(bps / 1000000000).toFixed(1)} Gbps`;
    if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
    if (bps >= 1000) return `${(bps / 1000).toFixed(1)} Kbps`;
    return `${bps} bps`;
  }

  // ─── Loading State ───────────────────────────────────────────
  if (profilesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="skeleton-wave h-10 w-full" />
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full mb-2" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Security Profiles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure ARP protection, DHCP snooping, client isolation, and other L2 security features
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => refetchProfiles()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="border-green-200 text-green-700 hover:bg-green-50"
            onClick={() => setApplyConfirmOpen(true)}
          >
            <ShieldCheck className="h-4 w-4 mr-2" />
            Apply Security
          </Button>
          <Dialog open={profileDialogOpen} onOpenChange={(o) => { setProfileDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" onClick={() => openDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Create Profile
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingProfile ? "Edit Security Profile" : "Create Security Profile"}</DialogTitle>
                <DialogDescription>
                  {editingProfile ? "Update an existing security profile" : "Define security features for an interface or bridge"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {/* Name & Description */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Name *</Label>
                    <Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="e.g. LAN Security" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium mb-1 block">Description</Label>
                    <Input value={profileForm.description} onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })} placeholder="Optional description" />
                  </div>
                </div>

                {/* Interface */}
                <div>
                  <Label className="text-sm font-medium mb-1 block">Interface</Label>
                  <Input value={profileForm.interfaceName} onChange={(e) => setProfileForm({ ...profileForm, interfaceName: e.target.value })} placeholder="e.g. br-lan, eth0" />
                </div>

                {/* Features Checkboxes */}
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[#DC2626]" />
                    Security Features
                  </h4>

                  {/* ARP Protection */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Switch checked={profileForm.arpProtection} onCheckedChange={(v) => setProfileForm({ ...profileForm, arpProtection: v })} />
                      <Label className="text-sm font-medium">ARP Protection</Label>
                      <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">L2</Badge>
                    </div>
                    {profileForm.arpProtection && (
                      <div className="ml-9">
                        <Label className="text-xs font-medium mb-1 block text-muted-foreground">Action on ARP violation</Label>
                        <Select value={profileForm.arpAction} onValueChange={(v: "DROP" | "REJECT") => setProfileForm({ ...profileForm, arpAction: v })}>
                          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DROP">DROP</SelectItem>
                            <SelectItem value="REJECT">REJECT</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* DHCP Snooping */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Switch checked={profileForm.dhcpSnooping} onCheckedChange={(v) => setProfileForm({ ...profileForm, dhcpSnooping: v })} />
                      <Label className="text-sm font-medium">DHCP Snooping</Label>
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200">L2</Badge>
                    </div>
                    {profileForm.dhcpSnooping && (
                      <div className="ml-9">
                        <Label className="text-xs font-medium mb-1 block text-muted-foreground">Trusted Ports (comma-separated)</Label>
                        <Input value={trustedPortsInput} onChange={(e) => setTrustedPortsInput(e.target.value)} placeholder="e.g. eth0, eth1, eth2" className="max-w-sm" />
                      </div>
                    )}
                  </div>

                  {/* Client Isolation */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Switch checked={profileForm.clientIsolation} onCheckedChange={(v) => setProfileForm({ ...profileForm, clientIsolation: v })} />
                      <Label className="text-sm font-medium">Client Isolation</Label>
                      <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-600 border-purple-200">L2</Badge>
                    </div>
                    {profileForm.clientIsolation && (
                      <div className="ml-9">
                        <Label className="text-xs font-medium mb-1 block text-muted-foreground">Isolated Interfaces (comma-separated)</Label>
                        <Input value={isolatedIfacesInput} onChange={(e) => setIsolatedIfacesInput(e.target.value)} placeholder="e.g. wlan0, wlan1" className="max-w-sm" />
                      </div>
                    )}
                  </div>

                  {/* Port Security */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Switch checked={profileForm.portSecurity} onCheckedChange={(v) => setProfileForm({ ...profileForm, portSecurity: v })} />
                      <Label className="text-sm font-medium">Port Security</Label>
                      <Badge variant="outline" className="text-[10px] bg-green-50 text-green-600 border-green-200">L2</Badge>
                    </div>
                    {profileForm.portSecurity && (
                      <div className="ml-9">
                        <Label className="text-xs font-medium mb-1 block text-muted-foreground">Max MAC Addresses per Port</Label>
                        <Input type="number" value={profileForm.maxMacPerPort} onChange={(e) => setProfileForm({ ...profileForm, maxMacPerPort: parseInt(e.target.value) || 2 })} min={1} max={128} className="max-w-32" />
                      </div>
                    )}
                  </div>

                  {/* Storm Control */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Switch checked={profileForm.stormControl} onCheckedChange={(v) => setProfileForm({ ...profileForm, stormControl: v })} />
                      <Label className="text-sm font-medium">Storm Control</Label>
                      <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200">L2</Badge>
                    </div>
                    {profileForm.stormControl && (
                      <div className="ml-9 grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs font-medium mb-1 block text-muted-foreground">BPS Limit</Label>
                          <Input type="number" value={profileForm.stormBpsLimit} onChange={(e) => setProfileForm({ ...profileForm, stormBpsLimit: parseInt(e.target.value) || 1000000 })} min={0} />
                          <p className="text-[10px] text-muted-foreground mt-0.5">{formatBps(profileForm.stormBpsLimit)}</p>
                        </div>
                        <div>
                          <Label className="text-xs font-medium mb-1 block text-muted-foreground">PPS Limit</Label>
                          <Input type="number" value={profileForm.stormPpsLimit} onChange={(e) => setProfileForm({ ...profileForm, stormPpsLimit: parseInt(e.target.value) || 1000 })} min={0} />
                          <p className="text-[10px] text-muted-foreground mt-0.5">{profileForm.stormPpsLimit} packets/sec</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Enable toggle */}
                <div className="flex items-center gap-3">
                  <Switch checked={profileForm.enabled} onCheckedChange={(v) => setProfileForm({ ...profileForm, enabled: v })} />
                  <Label className="text-sm font-medium">Enabled</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setProfileDialogOpen(false); resetForm(); }}>Cancel</Button>
                <Button
                  className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
                  onClick={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                  ) : editingProfile ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Profiles" value={stats.totalProfiles} subtitle="Security configurations" icon={Shield} gradient="stat-gradient-red" delay={0} />
        <StatCard title="Active Features" value={stats.activeFeatures} subtitle="Enabled protections" icon={ShieldCheck} gradient="stat-gradient-green" delay={75} />
        <StatCard title="ARP Protection" value={stats.arpProtection} subtitle="Profiles with ARP guard" icon={Radar} gradient="stat-gradient-amber" delay={150} />
        <StatCard title="Client Isolation" value={stats.clientIsolation} subtitle="Isolated interfaces" icon={WifiOff} gradient="stat-gradient-blue" delay={225} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="profiles">Security Profiles</TabsTrigger>
          <TabsTrigger value="features">Feature Details</TabsTrigger>
          <TabsTrigger value="logs">Security Logs</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Security Profiles ──────────────────────────── */}
        <TabsContent value="profiles">
          {/* Search */}
          <Card className="border shadow-sm mb-4">
            <CardContent className="p-4">
              <div className="relative">
                <Eye className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search profiles by name, description, interface..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" />
              </div>
            </CardContent>
          </Card>

          {/* Profiles Table */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[520px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Name</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Description</TableHead>
                      <TableHead className="text-xs font-medium uppercase">ARP</TableHead>
                      <TableHead className="text-xs font-medium uppercase">DHCP Snooping</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Client Isolation</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Port Security</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Storm Control</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Interface</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                          <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          No security profiles found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProfiles.map((profile) => (
                        <TableRow key={profile.id} className="odd:bg-muted/10 hover:bg-muted/30 transition-colors duration-150">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium">{profile.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                            {profile.description || "—"}
                          </TableCell>
                          <TableCell>
                            {profile.arpProtection ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <FeatureStatusDot enabled />
                                  </TooltipTrigger>
                                  <TooltipContent>{profile.arpAction || "DROP"}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <FeatureStatusDot enabled={false} />
                            )}
                          </TableCell>
                          <TableCell>
                            <FeatureStatusDot enabled={profile.dhcpSnooping} />
                          </TableCell>
                          <TableCell>
                            <FeatureStatusDot enabled={profile.clientIsolation} />
                          </TableCell>
                          <TableCell>
                            {profile.portSecurity ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <FeatureStatusDot enabled />
                                  </TooltipTrigger>
                                  <TooltipContent>Max MAC: {profile.maxMacPerPort || 2}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <FeatureStatusDot enabled={false} />
                            )}
                          </TableCell>
                          <TableCell>
                            {profile.stormControl ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <FeatureStatusDot enabled />
                                  </TooltipTrigger>
                                  <TooltipContent>{formatBps(profile.stormBpsLimit)} / {profile.stormPpsLimit} pps</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <FeatureStatusDot enabled={false} />
                            )}
                          </TableCell>
                          <TableCell>
                            {profile.interfaceName ? (
                              <Badge variant="outline" className="text-xs font-mono">{profile.interfaceName}</Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            {profile.enabled ? (
                              <Badge variant="outline" className="badge-active text-xs"><CheckCircle className="h-3 w-3 mr-0.5" />Active</Badge>
                            ) : (
                              <Badge variant="outline" className="badge-inactive text-xs"><XCircle className="h-3 w-3 mr-0.5" />Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDialog(profile)}>
                                      <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit profile</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteTarget(profile)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete profile</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab 2: Feature Details ────────────────────────────── */}
        <TabsContent value="features">
          <div className="flex gap-2 mb-4">
            <Button variant="outline" onClick={() => refetchFeatures()}>
              <RefreshCw className={`h-4 w-4 mr-2 ${featuresLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {featuresLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : features.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const featureIcon: Record<string, React.ElementType> = {
                  "ARP Protection": Radar,
                  "DHCP Snooping": ShieldAlert,
                  "Client Isolation": WifiOff,
                  "Port Security": Lock,
                  "Storm Control": Activity,
                };
                const Icon = featureIcon[feature.name] || Shield;
                return (
                  <Card key={feature.name} className={`border shadow-sm ring-1 ring-black/5 hover:shadow-md transition-all duration-200 ${FEATURE_BORDER_COLORS[feature.name] || ""}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Icon className="h-4 w-4 text-[#DC2626]" />
                          {feature.name}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            feature.status === "active"
                              ? "bg-green-100 text-green-700 border-green-200"
                              : feature.status === "partial"
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}
                        >
                          {feature.status === "active" ? (
                            <><CheckCircle className="h-3 w-3 mr-0.5" />Active</>
                          ) : feature.status === "partial" ? (
                            <><AlertTriangle className="h-3 w-3 mr-0.5" />Partial</>
                          ) : (
                            <><XCircle className="h-3 w-3 mr-0.5" />Inactive</>
                          )}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-3">
                      <p className="text-xs text-muted-foreground">{feature.description}</p>

                      {feature.affectedInterfaces.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">Affected Interfaces</p>
                          <div className="flex flex-wrap gap-1">
                            {feature.affectedInterfaces.map((iface) => (
                              <Badge key={iface} variant="outline" className="text-[10px] font-mono">{iface}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {feature.details.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">Details</p>
                          <ul className="space-y-1">
                            {feature.details.map((detail, idx) => (
                              <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/50" />
                                {detail}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border shadow-sm">
              <CardContent className="text-center py-12 text-muted-foreground">
                <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No feature details available. Ensure security profiles are active.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Tab 3: Security Logs ──────────────────────────────── */}
        <TabsContent value="logs">
          <div className="flex gap-2 mb-4">
            <Button variant="outline" onClick={() => refetchLogs()}>
              <RefreshCw className={`h-4 w-4 mr-2 ${logsLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-0">
              {logsLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : logs.length > 0 ? (
                <ScrollArea className="max-h-[520px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-medium uppercase">Timestamp</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Severity</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Action</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Rule/Profile</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Interface</TableHead>
                        <TableHead className="text-xs font-medium uppercase">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id} className="odd:bg-muted/10 hover:bg-muted/30 transition-colors duration-150">
                          <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] font-semibold ${SEVERITY_COLORS[log.severity] || ""}`}>
                              {log.severity.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-medium">{log.action}</TableCell>
                          <TableCell className="text-xs">{log.entityName}</TableCell>
                          <TableCell className="text-xs font-mono">{log.interfaceName || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  {log.details}
                                </TooltipTrigger>
                                <TooltipContent className="max-w-md">{log.details}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileWarning className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No security logs available.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Security Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apply Confirmation */}
      <AlertDialog open={applyConfirmOpen} onOpenChange={setApplyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Security Profiles</AlertDialogTitle>
            <AlertDialogDescription>
              This will apply all active security profiles to their configured interfaces.
              Active security features (ARP protection, DHCP snooping, etc.) will be enforced.
              Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Applying...</> : "Apply Security"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
