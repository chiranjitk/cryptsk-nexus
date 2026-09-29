"use client";

import { useReducer, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { Gauge, Settings2, Trash2, Plus, Clock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────
interface DeviceOption {
  id: string;
  name: string;
  ipAddress: string;
  type: string;
}

interface ThrottleConfig {
  id: string;
  deviceId: string;
  maxDownloadMbps: number;
  maxUploadMbps: number;
  scheduleEnabled: boolean;
  scheduleStartTime: string;
  scheduleEndTime: string;
  scheduleDays: string;
  enabled: boolean;
  device: { id: string; name: string; ipAddress: string; type: string } | null;
}

interface ThrottleFormState {
  open: boolean; editId: string; deviceId: string; maxDl: string; maxUl: string;
  scheduleEnabled: boolean; startTime: string; endTime: string;
}

// ─── Component ────────────────────────────────────────────────────
export default function ThrottlingTab({
  deviceOptions,
}: {
  deviceOptions: DeviceOption[];
}) {
  const queryClient = useQueryClient();

  const [throttleState, setThrottleState] = useReducer(
    (_prev: ThrottleFormState, next: Partial<ThrottleFormState>) => ({ ..._prev, ...next }),
    {
      open: false, editId: "", deviceId: "", maxDl: "100", maxUl: "50",
      scheduleEnabled: false, startTime: "09:00", endTime: "18:00",
    }
  );

  // ─── Query: always enabled since this component only mounts when tab is active
  const { data: throttleData, isLoading } = useQuery<{ configs: ThrottleConfig[] }>({
    queryKey: ["bandwidth-throttle"],
    queryFn: () => apiFetch<{ configs: ThrottleConfig[] }>("/api/bandwidth/throttle"),
  });

  // ─── Mutations ──────────────────────────────────────────────────
  const saveThrottleMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return apiFetch("/api/bandwidth/throttle", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast.success("Throttle config saved");
      setThrottleState({ open: false });
      queryClient.invalidateQueries({ queryKey: ["bandwidth-throttle"] });
    },
    onError: () => toast.error("Failed to save throttle config"),
  });

  const deleteThrottleMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/bandwidth/throttle?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success("Throttle config deleted");
      queryClient.invalidateQueries({ queryKey: ["bandwidth-throttle"] });
    },
    onError: () => toast.error("Failed to delete throttle config"),
  });

  // ─── Handlers ───────────────────────────────────────────────────
  const handleOpenThrottleDialog = useCallback((config?: ThrottleConfig) => {
    if (config) {
      setThrottleState({
        open: true, editId: config.id, deviceId: config.deviceId,
        maxDl: String(config.maxDownloadMbps), maxUl: String(config.maxUploadMbps),
        scheduleEnabled: config.scheduleEnabled,
        startTime: config.scheduleStartTime, endTime: config.scheduleEndTime,
      });
    } else {
      setThrottleState({
        open: true, editId: "", deviceId: "", maxDl: "100", maxUl: "50",
        scheduleEnabled: false, startTime: "09:00", endTime: "18:00",
      });
    }
  }, []);

  const handleSaveThrottle = useCallback(() => {
    if (!throttleState.deviceId) {
      toast.error("Please select a device");
      return;
    }
    saveThrottleMutation.mutate({
      id: throttleState.editId || undefined,
      deviceId: throttleState.deviceId,
      maxDownloadMbps: Number(throttleState.maxDl),
      maxUploadMbps: Number(throttleState.maxUl),
      scheduleEnabled: throttleState.scheduleEnabled,
      scheduleStartTime: throttleState.startTime,
      scheduleEndTime: throttleState.endTime,
      scheduleDays: "[1,2,3,4,5]",
    });
  }, [throttleState, saveThrottleMutation]);

  // ─── Render ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Bandwidth Throttling</h2>
            <p className="text-sm text-muted-foreground">Configure speed limits per device with optional scheduling.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="border shadow-sm animate-pulse">
              <CardContent className="p-4 h-40" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Bandwidth Throttling</h2>
          <p className="text-sm text-muted-foreground">Configure speed limits per device with optional scheduling.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => handleOpenThrottleDialog()}>
          <Plus className="h-4 w-4" />Add Throttle Rule
        </Button>
      </div>

      {throttleData?.configs && throttleData.configs.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {throttleData.configs.map((cfg) => (
            <Card key={cfg.id} className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-orange-500" />
                      <span className="font-semibold text-sm">{cfg.device?.name || cfg.deviceId}</span>
                      <Badge variant={cfg.enabled ? "default" : "secondary"} className="text-[10px]">{cfg.enabled ? "Active" : "Disabled"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{cfg.device?.ipAddress}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenThrottleDialog(cfg)}><Settings2 className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => deleteThrottleMutation.mutate(cfg.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Max Download</p>
                    <p className="text-sm font-semibold text-green-600">{cfg.maxDownloadMbps} Mbps</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Max Upload</p>
                    <p className="text-sm font-semibold text-teal-600">{cfg.maxUploadMbps} Mbps</p>
                  </div>
                </div>
                {cfg.scheduleEnabled && (
                  <div className="mt-2 p-2 rounded bg-muted/50 text-xs text-muted-foreground">
                    <Clock className="inline h-3 w-3 mr-1" />
                    Scheduled: {cfg.scheduleStartTime} – {cfg.scheduleEndTime} (Weekdays)
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border shadow-sm">
          <CardContent className="p-8 text-center">
            <Gauge className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No throttle rules configured yet.</p>
            <Button size="sm" className="mt-3 gap-1.5" onClick={() => handleOpenThrottleDialog()}>
              <Plus className="h-4 w-4" />Add First Rule
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════ Throttle Dialog ═══════════════ */}
      <Dialog open={throttleState.open} onOpenChange={(open) => { if (!open) setThrottleState({ open: false }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{throttleState.editId ? "Edit" : "Add"} Throttle Rule</DialogTitle>
            <DialogDescription>Set bandwidth speed limits for a specific device.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Device</Label>
              <Select value={throttleState.deviceId} onValueChange={(v) => setThrottleState({ deviceId: v })}>
                <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                <SelectContent>
                  {deviceOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} ({d.ipAddress})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="max-dl">Max Download (Mbps)</Label>
                <Input id="max-dl" type="number" min="1" value={throttleState.maxDl} onChange={(e) => setThrottleState({ maxDl: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="max-ul">Max Upload (Mbps)</Label>
                <Input id="max-ul" type="number" min="1" value={throttleState.maxUl} onChange={(e) => setThrottleState({ maxUl: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Schedule</Label>
                <p className="text-xs text-muted-foreground">Enable time-based throttling</p>
              </div>
              <Switch checked={throttleState.scheduleEnabled} onCheckedChange={(checked) => setThrottleState({ scheduleEnabled: checked })} />
            </div>
            {throttleState.scheduleEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="start-time">Start Time</Label>
                  <Input id="start-time" type="time" value={throttleState.startTime} onChange={(e) => setThrottleState({ startTime: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end-time">End Time</Label>
                  <Input id="end-time" type="time" value={throttleState.endTime} onChange={(e) => setThrottleState({ endTime: e.target.value })} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThrottleState({ open: false })}>Cancel</Button>
            <Button onClick={handleSaveThrottle} disabled={saveThrottleMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
