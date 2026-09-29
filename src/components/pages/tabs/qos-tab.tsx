"use client";

import { useReducer, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { Zap, Settings2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────
interface PlanOption {
  id: string;
  name: string;
}

interface QosConfigItem {
  id: string;
  name: string;
  priority: string;
  targetPlanId: string | null;
  targetIpRange: string;
  maxBandwidthMbps: number;
  minBandwidthMbps: number;
  enabled: boolean;
  targetPlan: { id: string; name: string } | null;
}

interface QosFormState {
  open: boolean; editId: string; name: string; priority: string; targetPlanId: string;
  ipRange: string; maxBw: string; minBw: string;
}

// ─── Component ────────────────────────────────────────────────────
export default function QosTab({
  planOptions,
}: {
  planOptions: PlanOption[];
}) {
  const queryClient = useQueryClient();

  const [qosState, setQosState] = useReducer(
    (_prev: QosFormState, next: Partial<QosFormState>) => ({ ..._prev, ...next }),
    {
      open: false, editId: "", name: "", priority: "MEDIUM", targetPlanId: "",
      ipRange: "", maxBw: "0", minBw: "0",
    }
  );

  // ─── Query: always enabled since this component only mounts when tab is active
  const { data: qosData, isLoading } = useQuery<{ configs: QosConfigItem[] }>({
    queryKey: ["bandwidth-qos"],
    queryFn: () => apiFetch<{ configs: QosConfigItem[] }>("/api/bandwidth/qos"),
  });

  // ─── Mutations ──────────────────────────────────────────────────
  const saveQosMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return apiFetch("/api/bandwidth/qos", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast.success("QoS config saved");
      setQosState({ open: false });
      queryClient.invalidateQueries({ queryKey: ["bandwidth-qos"] });
    },
    onError: () => toast.error("Failed to save QoS config"),
  });

  const deleteQosMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/bandwidth/qos?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success("QoS config deleted");
      queryClient.invalidateQueries({ queryKey: ["bandwidth-qos"] });
    },
    onError: () => toast.error("Failed to delete QoS config"),
  });

  // ─── Handlers ───────────────────────────────────────────────────
  const handleOpenQosDialog = useCallback((config?: QosConfigItem) => {
    if (config) {
      setQosState({
        open: true, editId: config.id, name: config.name, priority: config.priority,
        targetPlanId: config.targetPlanId || "", ipRange: config.targetIpRange,
        maxBw: String(config.maxBandwidthMbps), minBw: String(config.minBandwidthMbps),
      });
    } else {
      setQosState({
        open: true, editId: "", name: "", priority: "MEDIUM", targetPlanId: "",
        ipRange: "", maxBw: "0", minBw: "0",
      });
    }
  }, []);

  const handleSaveQos = useCallback(() => {
    if (!qosState.name.trim()) {
      toast.error("Please enter a name");
      return;
    }
    saveQosMutation.mutate({
      id: qosState.editId || undefined,
      name: qosState.name,
      priority: qosState.priority,
      targetPlanId: qosState.targetPlanId || undefined,
      targetIpRange: qosState.ipRange,
      maxBandwidthMbps: Number(qosState.maxBw),
      minBandwidthMbps: Number(qosState.minBw),
    });
  }, [qosState, saveQosMutation]);

  // ─── Render ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Quality of Service (QoS)</h2>
            <p className="text-sm text-muted-foreground">Prioritize traffic by plan or IP range with bandwidth guarantees.</p>
          </div>
        </div>
        <Card className="border shadow-sm animate-pulse">
          <CardContent className="p-4 h-48" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Quality of Service (QoS)</h2>
          <p className="text-sm text-muted-foreground">Prioritize traffic by plan or IP range with bandwidth guarantees.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => handleOpenQosDialog()}>
          <Plus className="h-4 w-4" />Add QoS Rule
        </Button>
      </div>

      {qosData?.configs && qosData.configs.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Priority</TableHead>
                <TableHead className="text-xs">Target Plan</TableHead>
                <TableHead className="text-xs">IP Range</TableHead>
                <TableHead className="text-xs">Min BW</TableHead>
                <TableHead className="text-xs">Max BW</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {qosData.configs.map((cfg) => (
                <TableRow key={cfg.id} className="hover:bg-muted/50 transition-colors duration-150">
                  <TableCell className="text-xs font-medium">{cfg.name}</TableCell>
                  <TableCell>
                    <Badge variant={cfg.priority === "HIGH" ? "destructive" : cfg.priority === "MEDIUM" ? "default" : cfg.priority === "LOW" ? "secondary" : "outline"} className="text-[10px]">
                      {cfg.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{cfg.targetPlan?.name || <span className="text-muted-foreground">Any</span>}</TableCell>
                  <TableCell className="text-xs font-mono">{cfg.targetIpRange || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-xs">{cfg.minBandwidthMbps > 0 ? `${cfg.minBandwidthMbps} Mbps` : "—"}</TableCell>
                  <TableCell className="text-xs">{cfg.maxBandwidthMbps > 0 ? `${cfg.maxBandwidthMbps} Mbps` : "Unlimited"}</TableCell>
                  <TableCell>
                    <Badge variant={cfg.enabled ? "default" : "secondary"} className="text-[10px]">{cfg.enabled ? "Active" : "Disabled"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenQosDialog(cfg)}><Settings2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => deleteQosMutation.mutate(cfg.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Card className="border shadow-sm">
          <CardContent className="p-8 text-center">
            <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No QoS rules configured yet.</p>
            <Button size="sm" className="mt-3 gap-1.5" onClick={() => handleOpenQosDialog()}>
              <Plus className="h-4 w-4" />Add First Rule
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════ QoS Dialog ═══════════════ */}
      <Dialog open={qosState.open} onOpenChange={(open) => { if (!open) setQosState({ open: false }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{qosState.editId ? "Edit" : "Add"} QoS Rule</DialogTitle>
            <DialogDescription>Configure traffic prioritization and bandwidth guarantees.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="qos-name">Rule Name</Label>
              <Input id="qos-name" placeholder="e.g. Video Priority" value={qosState.name} onChange={(e) => setQosState({ name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select value={qosState.priority} onValueChange={(v) => setQosState({ priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Target Plan</Label>
              <Select value={qosState.targetPlanId} onValueChange={(v) => setQosState({ targetPlanId: v })}>
                <SelectTrigger><SelectValue placeholder="Any Plan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any Plan</SelectItem>
                  {planOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ip-range">IP Range (optional)</Label>
              <Input id="ip-range" placeholder="e.g. 192.168.1.0/24" value={qosState.ipRange} onChange={(e) => setQosState({ ipRange: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="min-bw">Min BW (Mbps)</Label>
                <Input id="min-bw" type="number" min="0" value={qosState.minBw} onChange={(e) => setQosState({ minBw: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="max-bw">Max BW (Mbps)</Label>
                <Input id="max-bw" type="number" min="0" value={qosState.maxBw} onChange={(e) => setQosState({ maxBw: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQosState({ open: false })}>Cancel</Button>
            <Button onClick={handleSaveQos} disabled={saveQosMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
