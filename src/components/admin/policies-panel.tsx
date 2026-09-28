"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Shield, Zap, Clock, HardDrive, Lock, Activity,
  MoreHorizontal, Eye, Edit, Rocket, Trash2, AlertCircle, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type Policy = {
  id: string; policyCode: string; name: string; type: string; status: string;
  version: number; precedence: number; config: string; radiusGroupName: string | null;
  publishedAt: string | null; createdAt: string;
  _count: { versions: number; planMappings: number };
};

const POLICY_TEMPLATES: Record<string, string> = {
  bandwidth: JSON.stringify({
    bandwidth: { downloadKbps: 50000, uploadKbps: 25000, burstDownloadKbps: 60000, burstUploadKbps: 30000, burstTimeSec: 8 },
  }, null, 2),
  fup: JSON.stringify({
    bandwidth: { downloadKbps: 50000, uploadKbps: 25000 },
    fup: { thresholdGb: 100, postFupDownloadKbps: 10000, postFupUploadKbps: 5000 },
  }, null, 2),
  access_time: JSON.stringify({
    accessTime: { startTime: "09:00", endTime: "21:00", daysOfWeek: ["mon","tue","wed","thu","fri"], sessionTimeoutSec: 28800 },
  }, null, 2),
  data_transfer: JSON.stringify({
    dataTransfer: { dailyLimitGb: 5, monthlyLimitGb: 100, sessionLimitMb: 500 },
  }, null, 2),
  security: JSON.stringify({
    security: { filterId: "BB-SAFE", nasFilterId: "restrict-social", ipPool: "pool-100", dnsPrimary: "8.8.8.8", dnsSecondary: "8.8.4.4" },
  }, null, 2),
  combined: JSON.stringify({
    bandwidth: { downloadKbps: 50000, uploadKbps: 25000, burstDownloadKbps: 60000, burstUploadKbps: 30000, burstTimeSec: 8 },
    fup: { thresholdGb: 100, postFupDownloadKbps: 10000, postFupUploadKbps: 5000 },
    accessTime: { sessionTimeoutSec: 28800 },
    security: { ipPool: "pool-100", dnsPrimary: "8.8.8.8", dnsSecondary: "8.8.4.4" },
  }, null, 2),
};

export function PoliciesPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [editPolicy, setEditPolicy] = React.useState<Policy | null>(null);
  const [simulatePolicyId, setSimulatePolicyId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["policies", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/policies?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const deletePolicy = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/policies/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast({ title: "Policy deleted" });
      qc.invalidateQueries({ queryKey: ["policies"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const publishPolicy = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/policies/${id}/publish`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Policy published to RADIUS",
        description: `${data.checkItems} check items + ${data.replyItems} reply items synced to ${data.groupname}`,
      });
      qc.invalidateQueries({ queryKey: ["policies"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const policies: Policy[] = data?.policies || [];

  function getTypeIcon(type: string) {
    const icons: Record<string, typeof Shield> = {
      bandwidth: Zap, fup: Activity, access_time: Clock,
      data_transfer: HardDrive, security: Lock, qos: Activity,
      auth: Shield, content_filter: Lock, combined: Shield,
    };
    return icons[type] || Shield;
  }

  function getStatusColor(status: string) {
    if (status === "active") return "border-emerald-500/30 bg-emerald-500/5 text-emerald-600";
    if (status === "draft") return "border-amber-500/30 bg-amber-500/5 text-amber-600";
    if (status === "deprecated") return "border-rose-500/30 bg-rose-500/5 text-rose-600";
    return "border-muted bg-muted/50 text-muted-foreground";
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Policy Engine</h1>
          <p className="text-sm text-muted-foreground">
            {policies.length} policies · Versioned · Precedence-based · RADIUS compiler
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" /> Create Policy
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="size-4 text-primary" /> All Policies
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search policies…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-48 pl-8 text-sm" />
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
                    <TableHead>Policy</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>RADIUS Group</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Precedence</TableHead>
                    <TableHead>Mappings</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.map((p) => {
                    const Icon = getTypeIcon(p.type);
                    return (
                      <TableRow key={p.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                              <Icon className="size-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{p.name}</p>
                              <p className="text-[10px] text-muted-foreground">{p.description || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{p.policyCode}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{p.type}</Badge></TableCell>
                        <TableCell className="text-xs font-mono text-violet-600">{p.radiusGroupName || "—"}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">v{p.version}</Badge></TableCell>
                        <TableCell className="text-sm tabular-nums">{p.precedence}</TableCell>
                        <TableCell className="text-sm tabular-nums">{p._count.planMappings}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${getStatusColor(p.status)}`}>
                            {p.status === "active" && <CheckCircle2 className="size-3 mr-1" />}
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSimulatePolicyId(p.id)}>
                                <Eye className="mr-2 size-4" /> Simulate (preview RADIUS)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditPolicy(p)}>
                                <Edit className="mr-2 size-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => publishPolicy.mutate(p.id)}
                                disabled={p.status === "active" || !p.radiusGroupName}
                              >
                                <Rocket className="mr-2 size-4" /> Publish to RADIUS
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-rose-600 focus:text-rose-600 focus:bg-rose-500/10"
                                onClick={() => { if (confirm(`Delete ${p.name}?`)) deletePolicy.mutate(p.id); }}
                              >
                                <Trash2 className="mr-2 size-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {policies.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                        No policies found. Click "Create Policy" to define one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {(showCreate || editPolicy) && (
        <PolicyDialog
          policy={editPolicy}
          onClose={() => { setShowCreate(false); setEditPolicy(null); }}
          onSaved={() => { setShowCreate(false); setEditPolicy(null); qc.invalidateQueries({ queryKey: ["policies"] }); }}
        />
      )}

      {simulatePolicyId && (
        <SimulateDialog policyId={simulatePolicyId} onClose={() => setSimulatePolicyId(null)} />
      )}
    </div>
  );
}

function PolicyDialog({ policy, onClose, onSaved }: { policy: Policy | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isEdit = !!policy;
  const [name, setName] = React.useState(policy?.name || "");
  const [description, setDescription] = React.useState(policy?.description || "");
  const [type, setType] = React.useState(policy?.type || "combined");
  const [precedence, setPrecedence] = React.useState(String(policy?.precedence || 0));
  const [radiusGroupName, setRadiusGroupName] = React.useState(policy?.radiusGroupName || "");
  const [config, setConfig] = React.useState(policy?.config || POLICY_TEMPLATES.combined);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      // Validate JSON
      JSON.parse(config);

      const url = isEdit ? `/api/policies/${policy!.id}` : "/api/policies";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, type, precedence: Number(precedence), radiusGroupName: radiusGroupName || null, config }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast({ title: isEdit ? "Policy updated" : "Policy created" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl cryptsk-card-load max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Policy" : "Create Policy"}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Editing ${policy!.policyCode}` : "Define a policy (versioned, compiled to RADIUS attributes)"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Policy Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="50Mbps Monthly with FUP" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <select value={type} onChange={(e) => { setType(e.target.value); setConfig(POLICY_TEMPLATES[e.target.value] || "{}"); }} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="bandwidth">Bandwidth</option>
                <option value="fup">FUP</option>
                <option value="access_time">Access Time</option>
                <option value="data_transfer">Data Transfer</option>
                <option value="security">Security</option>
                <option value="qos">QoS</option>
                <option value="combined">Combined</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">RADIUS Group Name</Label>
              <Input value={radiusGroupName} onChange={(e) => setRadiusGroupName(e.target.value)} placeholder="BB-50Mbps-FUP" className="h-9 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Precedence (higher = wins)</Label>
              <Input type="number" value={precedence} onChange={(e) => setPrecedence(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="50Mbps with 100GB FUP, daily 5GB limit" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Policy Config (JSON)</Label>
            <textarea
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              className="w-full min-h-[200px] rounded-md border border-input bg-background p-3 text-xs font-mono cryptsk-scrollbar"
              spellCheck={false}
            />
            <p className="text-[10px] text-muted-foreground">
              Config supports: bandwidth, fup, accessTime, dataTransfer, security, qos
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{isEdit ? "Save (creates new version)" : "Create Policy"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SimulateDialog({ policyId, onClose }: { policyId: string; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["simulate", policyId],
    queryFn: async () => {
      const res = await fetch(`/api/policies/${policyId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nasType: "mikrotik" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl cryptsk-card-load max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-5 text-primary" /> Policy Simulator
          </DialogTitle>
          <DialogDescription>Preview compiled RADIUS attributes (not deployed)</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="size-6 rounded-full border-2 border-primary border-t-transparent cryptsk-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-rose-600">Error: {(error as Error).message}</p>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-2">
                <p className="text-[10px] text-muted-foreground">Policy</p>
                <p className="text-sm font-medium">{data.policyName}</p>
              </div>
              <div className="rounded-lg border p-2">
                <p className="text-[10px] text-muted-foreground">RADIUS Group</p>
                <p className="text-sm font-mono text-violet-600">{data.radiusGroupName || "—"}</p>
              </div>
            </div>

            {data.warnings?.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
                {data.warnings.map((w: string, i: number) => (
                  <p key={i} className="text-xs text-amber-600 flex items-start gap-1.5">
                    <AlertCircle className="size-3 mt-0.5 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Shield className="size-4" /> Check Items (radgroupcheck)
              </h4>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Attribute</TableHead>
                      <TableHead className="text-xs">Op</TableHead>
                      <TableHead className="text-xs">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.compiled?.checkItems?.map((item: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono">{item.attribute}</TableCell>
                        <TableCell className="text-xs font-mono">{item.op}</TableCell>
                        <TableCell className="text-xs font-mono text-emerald-600">{item.value}</TableCell>
                      </TableRow>
                    ))}
                    {(!data.compiled?.checkItems || data.compiled.checkItems.length === 0) && (
                      <TableRow><TableCell colSpan={3} className="text-xs text-center text-muted-foreground">No check items</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Rocket className="size-4" /> Reply Items (radgroupreply)
              </h4>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Attribute</TableHead>
                      <TableHead className="text-xs">Op</TableHead>
                      <TableHead className="text-xs">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.compiled?.replyItems?.map((item: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-mono">{item.attribute}</TableCell>
                        <TableCell className="text-xs font-mono">{item.op}</TableCell>
                        <TableCell className="text-xs font-mono text-blue-600">{item.value}</TableCell>
                      </TableRow>
                    ))}
                    {(!data.compiled?.replyItems || data.compiled.replyItems.length === 0) && (
                      <TableRow><TableCell colSpan={3} className="text-xs text-center text-muted-foreground">No reply items</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
