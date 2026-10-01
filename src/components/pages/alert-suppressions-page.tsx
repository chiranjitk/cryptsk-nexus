"use client";

// ═══════════════════════════════════════════════════════════════
// Alert Suppressions — maintenance windows that silence rules
// ═══════════════════════════════════════════════════════════════
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PauseCircle, Play, Loader2, Clock, ShieldOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { useIntegrationAction, formatTimestamp } from "@/components/integrations/shared";

interface Suppression {
  id: string;
  alertRuleId: string | null;
  reason: string;
  suppressedBy: string;
  startsAt: string;
  endsAt: string | null;
}

interface RulesPayload {
  suppressions: Suppression[];
  rules: { id: string; name: string }[];
}

export function AlertSuppressionsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [ruleId, setRuleId] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("60");

  const { data, isLoading, refetch, isFetching } = useQuery<RulesPayload>({
    queryKey: ["alert-suppressions"],
    queryFn: () => apiFetch("/api/alerts"),
    refetchInterval: 30000,
  });
  const suppressions = data?.suppressions ?? [];
  const rules = data?.rules ?? [];
  const ruleName = (id: string | null) => rules.find((r) => r.id === id)?.name ?? "All rules";
  const action = useIntegrationAction();

  function isActive(s: Suppression) {
    if (s.endsAt && new Date(s.endsAt) < new Date()) return false;
    return true;
  }
  function createSuppression() {
    if (!ruleId || !reason.trim()) { toast.error("Pick a rule and enter a reason"); return; }
    const endsAt = duration === "0" ? null : new Date(Date.now() + parseInt(duration) * 60000).toISOString();
    action.mutate(
      { action: "suppress-rule", ruleId, reason, suppressedBy: "admin", endsAt } as Record<string, unknown>,
      {
        onSuccess: () => { toast.success("Suppression created"); setCreateOpen(false); setRuleId(""); setReason(""); refetch(); },
        onError: (e: Error) => toast.error(e.message || "Suppress failed"),
      }
    );
  }
  function lift(s: Suppression) {
    action.mutate({ action: "unsuppress-rule", ruleId: s.alertRuleId, suppressionId: s.id } as Record<string, unknown>, {
      onSuccess: () => { toast.success("Suppression lifted"); refetch(); },
      onError: () => toast.error("Lift failed — rule may still be suppressed"),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><PauseCircle className="h-5 w-5 text-violet-600" />Alert Suppressions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Maintenance windows that temporarily silence alert rules during planned work.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button size="sm" className="text-xs h-8"><Clock className="h-3 w-3 mr-1" />New Suppression</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Suppress Alert Rule</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-1">
              <div><Label className="text-sm">Rule</Label>
                <Select value={ruleId} onValueChange={setRuleId}><SelectTrigger className="mt-1"><SelectValue placeholder="Select rule" /></SelectTrigger>
                  <SelectContent>{rules.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div><Label className="text-sm">Reason *</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Scheduled OLT firmware upgrade" className="mt-1" /></div>
              <div><Label className="text-sm">Duration</Label>
                <Select value={duration} onValueChange={setDuration}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="240">4 hours</SelectItem>
                    <SelectItem value="1440">24 hours</SelectItem>
                    <SelectItem value="0">Until manually lifted</SelectItem>
                  </SelectContent></Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button disabled={action.isPending} onClick={createSuppression}>{action.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <PauseCircle className="h-3.5 w-3.5 mr-1" />}Suppress</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border">
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow className="bg-muted/50">
              <TableHead className="text-xs">Rule</TableHead>
              <TableHead className="text-xs">Reason</TableHead>
              <TableHead className="text-xs">By</TableHead>
              <TableHead className="text-xs">Started</TableHead>
              <TableHead className="text-xs">Ends</TableHead>
              <TableHead className="text-xs">State</TableHead>
              <TableHead className="text-xs text-right">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="py-10"><Skeleton className="h-20 w-full" /></TableCell></TableRow>
              ) : suppressions.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-12 text-center"><PauseCircle className="h-10 w-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm font-medium">No suppressions</p><p className="text-xs text-muted-foreground mt-1">All alert rules are live. Create a suppression before planned maintenance.</p></TableCell></TableRow>
              ) : suppressions.map((s) => (
                <TableRow key={s.id} className="hover:bg-muted/30">
                  <TableCell className="text-xs font-medium">{ruleName(s.alertRuleId)}</TableCell>
                  <TableCell className="text-xs max-w-[220px] truncate" title={s.reason}>{s.reason || "—"}</TableCell>
                  <TableCell className="text-xs">{s.suppressedBy || "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatTimestamp(s.startsAt)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{s.endsAt ? formatTimestamp(s.endsAt) : <Badge variant="secondary" className="text-[10px]">manual</Badge>}</TableCell>
                  <TableCell>{isActive(s) ? <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px]"><PauseCircle className="h-3 w-3 mr-1" />Suppressing</Badge> : <Badge variant="outline" className="text-[10px]">Expired</Badge>}</TableCell>
                  <TableCell className="text-right">
                    {isActive(s) && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => lift(s)} disabled={action.isPending}>
                        {action.isPending && isFetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}Lift
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-center"><ShieldOff className="h-3 w-3" />Suppressed rules do not generate new alerts until the window ends or the suppression is lifted.</p>
    </div>
  );
}

export default AlertSuppressionsPage;
