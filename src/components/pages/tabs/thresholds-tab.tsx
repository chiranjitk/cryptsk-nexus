"use client";

import { useReducer, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { Bell, Trash2, Plus } from "lucide-react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────
interface AlertRuleItem {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: string;
  notifyChannels: string;
  enabled: boolean;
}

interface AlertFormState {
  open: boolean; ruleName: string; deviceId: string; metric: string;
  value: string; direction: string; severity: string;
}

// ─── Helper ──────────────────────────────────────────────────────
function safeJsonParse<T = unknown>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

// ─── Component ────────────────────────────────────────────────────
export default function ThresholdsTab() {
  const queryClient = useQueryClient();

  const [alertState, setAlertState] = useReducer(
    (_prev: AlertFormState, next: Partial<AlertFormState>) => ({ ..._prev, ...next }),
    {
      open: false, ruleName: "", deviceId: "", metric: "download",
      value: "500", direction: "above", severity: "MEDIUM",
    }
  );

  // ─── Query: always enabled since this component only mounts when tab is active
  const { data: alertRulesData, isLoading } = useQuery<{ rules: AlertRuleItem[] }>({
    queryKey: ["bandwidth-thresholds"],
    queryFn: () => apiFetch<{ rules: AlertRuleItem[] }>("/api/bandwidth/thresholds"),
  });

  // ─── Mutations ──────────────────────────────────────────────────
  const saveAlertRuleMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return apiFetch("/api/bandwidth/thresholds", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast.success("Alert rule created");
      setAlertState({ open: false });
      queryClient.invalidateQueries({ queryKey: ["bandwidth-thresholds"] });
    },
    onError: () => toast.error("Failed to create alert rule"),
  });

  const deleteAlertRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/bandwidth/thresholds?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success("Alert rule deleted");
      queryClient.invalidateQueries({ queryKey: ["bandwidth-thresholds"] });
    },
    onError: () => toast.error("Failed to delete alert rule"),
  });

  // ─── Handlers ───────────────────────────────────────────────────
  const handleOpenThresholdDialog = useCallback(() => {
    setAlertState({
      open: true, ruleName: "", deviceId: "", metric: "download",
      value: "500", direction: "above", severity: "MEDIUM",
    });
  }, []);

  const handleSaveAlertRule = useCallback(() => {
    if (!alertState.ruleName.trim()) {
      toast.error("Please enter a rule name");
      return;
    }
    const val = Number(alertState.value);
    if (isNaN(val) || val <= 0) {
      toast.error("Please enter a valid threshold value");
      return;
    }
    saveAlertRuleMutation.mutate({
      name: alertState.ruleName,
      deviceId: alertState.deviceId || undefined,
      metric: alertState.metric,
      thresholdValue: val,
      direction: alertState.direction,
      severity: alertState.severity,
    });
  }, [alertState, saveAlertRuleMutation]);

  // ─── Render ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Bandwidth Alert Rules</h2>
            <p className="text-sm text-muted-foreground">Configure automatic alerts when bandwidth exceeds or drops below thresholds.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="border shadow-sm animate-pulse">
              <CardContent className="p-4 h-32" />
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
          <h2 className="text-lg font-semibold text-foreground">Bandwidth Alert Rules</h2>
          <p className="text-sm text-muted-foreground">Configure automatic alerts when bandwidth exceeds or drops below thresholds.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={handleOpenThresholdDialog}>
          <Plus className="h-4 w-4" />Create Alert Rule
        </Button>
      </div>

      {alertRulesData?.rules && alertRulesData.rules.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {alertRulesData.rules.map((rule) => {
            const condition = safeJsonParse<Record<string, unknown>>(rule.condition, {});
            return (
              <Card key={rule.id} className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-amber-500" />
                        <span className="font-semibold text-sm">{rule.name}</span>
                        <Badge variant={rule.severity === "HIGH" ? "destructive" : rule.severity === "MEDIUM" ? "default" : "secondary"} className="text-[10px]">{rule.severity}</Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => deleteAlertRuleMutation.mutate(rule.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  <Separator className="my-3" />
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Metric:</span> <span className="font-medium ml-1">{String(condition.metric || "total").toUpperCase()}</span></div>
                    <div><span className="text-muted-foreground">Threshold:</span> <span className="font-medium ml-1">{rule.threshold} Mbps</span></div>
                    <div><span className="text-muted-foreground">Direction:</span> <span className="font-medium ml-1">{String(condition.direction || "above")}</span></div>
                    <div><span className="text-muted-foreground">Device:</span> <span className="font-medium ml-1">{condition.deviceId ? "Specific" : "All"}</span></div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border shadow-sm">
          <CardContent className="p-8 text-center">
            <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No bandwidth alert rules configured yet.</p>
            <Button size="sm" className="mt-3 gap-1.5" onClick={handleOpenThresholdDialog}>
              <Plus className="h-4 w-4" />Create First Rule
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════ Alert Rule Dialog ═══════════════ */}
      <Dialog open={alertState.open} onOpenChange={(open) => { if (!open) setAlertState({ open: false }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Alert Rule</DialogTitle>
            <DialogDescription>Set up a bandwidth alert rule that notifies when thresholds are crossed.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rule-name">Rule Name</Label>
              <Input id="rule-name" placeholder="e.g. High Download Alert" value={alertState.ruleName} onChange={(e) => setAlertState({ ruleName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Metric</Label>
                <Select value={alertState.metric} onValueChange={(v) => setAlertState({ metric: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="download">Download</SelectItem>
                    <SelectItem value="upload">Upload</SelectItem>
                    <SelectItem value="total">Total</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Direction</Label>
                <Select value={alertState.direction} onValueChange={(v) => setAlertState({ direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="above">Above</SelectItem>
                    <SelectItem value="below">Below</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="threshold-val">Threshold (Mbps)</Label>
              <Input id="threshold-val" type="number" min="1" value={alertState.value} onChange={(e) => setAlertState({ value: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Severity</Label>
              <Select value={alertState.severity} onValueChange={(v) => setAlertState({ severity: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertState({ open: false })}>Cancel</Button>
            <Button onClick={handleSaveAlertRule} disabled={saveAlertRuleMutation.isPending}>Create Rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
