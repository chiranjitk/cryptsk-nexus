'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { BarChart3, Play, Pause, Square, Plus, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ABTest {
  id: string;
  portalId: string;
  name: string;
  designA: any;
  designB: any;
  trafficSplit: number;
  status: string;
  conversionsA: number;
  conversionsB: number;
  impressionsA: number;
  impressionsB: number;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ABTestingSectionProps {
  portalId: string;
  currentDesign: any;
  toast: (opts: { title: string; description?: string; variant?: string }) => void;
  apiFetch: <T>(url: string, options?: RequestInit) => Promise<T | null>;
  apiMutate: (url: string, options?: RequestInit) => Promise<{ data: any; error: string | null }>;
}

export default function ABTestingSection({
  portalId,
  currentDesign,
  toast,
  apiFetch,
  apiMutate,
}: ABTestingSectionProps) {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTestName, setNewTestName] = useState('');
  const [trafficSplit, setTrafficSplit] = useState(50);
  const [creating, setCreating] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'stop' | 'delete'; name: string } | null>(null);

  const loadTests = useCallback(async () => {
    if (!portalId) return;
    setLoading(true);
    try {
      const data = await apiFetch<ABTest[]>(`/api/wifi/portal/ab-test?portalId=${portalId}`);
      if (data) setTests(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [portalId, apiFetch]);

  useEffect(() => {
    loadTests();
  }, [loadTests]);

  const handleCreate = async () => {
    if (!portalId || !newTestName.trim()) return;
    setCreating(true);
    try {
      const designA = {
        settings: currentDesign.settings,
        backgroundColor: currentDesign.backgroundColor,
        brandColor: currentDesign.brandColor,
        textColor: currentDesign.textColor,
        logoUrl: currentDesign.logoUrl,
        backgroundImageUrl: currentDesign.backgroundImageUrl,
      };
      // Design B is same as A initially — admin will modify it separately
      const designB = { ...designA };

      const { error } = await apiMutate('/api/wifi/portal/ab-test', {
        method: 'POST',
        body: JSON.stringify({
          portalId,
          name: newTestName.trim(),
          designA,
          designB,
          trafficSplit,
        }),
      });

      if (error) {
        toast({ title: 'Failed to create test', description: error, variant: 'destructive' });
      } else {
        toast({ title: 'A/B test created', description: `"${newTestName}" is now active` });
        setCreateOpen(false);
        setNewTestName('');
        setTrafficSplit(50);
        loadTests();
      }
    } catch {
      toast({ title: 'Failed to create test', variant: 'destructive' });
    }
    setCreating(false);
  };

  const handleStop = async () => {
    if (!confirmAction) return;
    setStoppingId(confirmAction.id);
    setConfirmAction(null);
    try {
      const { error } = await apiMutate(`/api/wifi/portal/ab-test?id=${confirmAction.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'stopped' }),
      });
      if (!error) {
        toast({ title: 'Test stopped', description: `"${confirmAction.name}" has been stopped` });
        loadTests();
      }
    } catch { /* ignore */ }
    setStoppingId(null);
  };

  const handlePause = async (test: ABTest) => {
    setActionId(test.id);
    try {
      const { error } = await apiMutate(`/api/wifi/portal/ab-test?id=${test.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'paused' }),
      });
      if (!error) {
        toast({ title: 'Test paused', description: `"${test.name}" has been paused` });
        loadTests();
      }
    } catch { /* ignore */ }
    setActionId(null);
  };

  const handleResume = async (test: ABTest) => {
    setActionId(test.id);
    try {
      const { error } = await apiMutate(`/api/wifi/portal/ab-test?id=${test.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'active' }),
      });
      if (!error) {
        toast({ title: 'Test resumed', description: `"${test.name}" is now active` });
        loadTests();
      }
    } catch { /* ignore */ }
    setActionId(null);
  };

  const handleDelete = async () => {
    if (!confirmAction) return;
    setConfirmAction(null);
    try {
      await apiMutate(`/api/wifi/portal/ab-test?id=${confirmAction.id}`, { method: 'DELETE' });
      toast({ title: 'Test deleted', description: `"${confirmAction.name}" has been deleted` });
      loadTests();
    } catch { /* ignore */ }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
      case 'paused': return 'bg-amber-500/10 text-amber-600 border-amber-200';
      case 'stopped': return 'bg-gray-500/10 text-gray-600 border-gray-200';
      default: return '';
    }
  };

  const ConversionBar = ({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) => {
    const total = a + b;
    const pctA = total > 0 ? (a / total) * 100 : 50;
    const pctB = total > 0 ? (b / total) * 100 : 50;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">{labelA}: <span className="font-semibold text-foreground">{a}</span> ({pctA.toFixed(1)}%)</span>
          <span className="text-muted-foreground">{labelB}: <span className="font-semibold text-foreground">{b}</span> ({pctB.toFixed(1)}%)</span>
        </div>
        <div className="flex h-5 rounded-full overflow-hidden bg-muted">
          <div className="bg-teal-500 transition-all duration-300" style={{ width: `${pctA}%` }} />
          <div className="bg-amber-500 transition-all duration-300" style={{ width: `${pctB}%` }} />
        </div>
        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500" />Design A</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Design B</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" />A/B Testing</Label>
        <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1" onClick={() => setCreateOpen(true)} disabled={!portalId}>
          <Plus className="h-3 w-3" />Create Test
        </Button>
      </div>

      {loading && tests.length === 0 ? (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-4 justify-center">
          <Loader2 className="h-3 w-3 animate-spin" />Loading tests...
        </div>
      ) : tests.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No A/B tests yet. Create a test to compare two different portal designs.</p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {tests.slice(0, 5).map((test) => {
            const totalImpressions = test.impressionsA + test.impressionsB;
            const totalConversions = test.conversionsA + test.conversionsB;
            const rateA = test.impressionsA > 0 ? ((test.conversionsA / test.impressionsA) * 100).toFixed(1) : '0.0';
            const rateB = test.impressionsB > 0 ? ((test.conversionsB / test.impressionsB) * 100).toFixed(1) : '0.0';
            return (
              <div key={test.id} className="rounded-lg border p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold truncate">{test.name}</p>
                      <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', statusColor(test.status))}>
                        {test.status}
                      </Badge>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      Traffic split: {test.trafficSplit}% / {100 - test.trafficSplit}% · Started {new Date(test.startDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-2 flex-shrink-0">
                    {test.status === 'active' && (
                      <>
                        <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => handlePause(test)} disabled={actionId === test.id}>
                          {actionId === test.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3 mr-0.5" />}Pause
                        </Button>
                        <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => setConfirmAction({ id: test.id, action: 'stop', name: test.name })} disabled={stoppingId === test.id}>
                          {stoppingId === test.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3 mr-0.5" />}Stop
                        </Button>
                      </>
                    )}
                    {test.status === 'paused' && (
                      <>
                        <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => handleResume(test)} disabled={actionId === test.id}>
                          {actionId === test.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-0.5" />}Resume
                        </Button>
                        <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => setConfirmAction({ id: test.id, action: 'stop', name: test.name })} disabled={stoppingId === test.id}>
                          {stoppingId === test.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3 mr-0.5" />}Stop
                        </Button>
                      </>
                    )}
                    {test.status === 'stopped' && (
                      <Button variant="outline" size="sm" className="text-[10px] h-6 px-2 text-destructive hover:text-destructive" onClick={() => setConfirmAction({ id: test.id, action: 'delete', name: test.name })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Impression stats */}
                <ConversionBar a={test.impressionsA} b={test.impressionsB} labelA="Impressions" labelB="Impressions" />

                {/* Conversion stats */}
                <div className="pt-1">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground">Conversions: <span className="font-semibold text-foreground">{test.conversionsA}</span> ({rateA}%)</span>
                    <span className="text-muted-foreground">Conversions: <span className="font-semibold text-foreground">{test.conversionsB}</span> ({rateB}%)</span>
                  </div>
                  <div className="flex h-4 rounded-full overflow-hidden bg-muted">
                    <div className="bg-emerald-500 transition-all duration-300" style={{ width: totalConversions > 0 ? `${(test.conversionsA / totalConversions) * 100}%` : '50%' }} />
                    <div className="bg-rose-400 transition-all duration-300" style={{ width: totalConversions > 0 ? `${(test.conversionsB / totalConversions) * 100}%` : '50%' }} />
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Design A</span>
                    <span className="text-[9px]">Total: {totalImpressions} impressions, {totalConversions} conversions</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" />Design B</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stop / Delete Confirm Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{confirmAction?.action === 'stop' ? 'Stop A/B Test' : 'Delete A/B Test'}</DialogTitle>
            <DialogDescription>
              {confirmAction?.action === 'stop'
                ? `Are you sure you want to stop "${confirmAction?.name}"? It will stop receiving traffic and be marked as completed.`
                : `Are you sure you want to permanently delete "${confirmAction?.name}"? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              size="sm"
              variant={confirmAction?.action === 'delete' ? 'destructive' : 'default'}
              onClick={confirmAction?.action === 'delete' ? handleDelete : handleStop}
            >
              {confirmAction?.action === 'stop' ? 'Stop Test' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create A/B Test Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-teal-500" />Create A/B Test</DialogTitle>
            <DialogDescription>Save your current design as Design A. You can later customize Design B.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Test Name</Label>
              <Input value={newTestName} onChange={(e) => setNewTestName(e.target.value)} className="text-xs" placeholder="e.g. Summer Layout Test" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Traffic Split for Design A (%)</Label>
              <div className="flex items-center gap-3">
                <Input type="number" min={1} max={99} value={trafficSplit} onChange={(e) => setTrafficSplit(Math.min(99, Math.max(1, parseInt(e.target.value) || 50)))} className="w-20 text-xs text-center" />
                <div className="flex-1 text-[10px] text-muted-foreground">
                  Design A: <span className="font-semibold">{trafficSplit}%</span> · Design B: <span className="font-semibold">{100 - trafficSplit}%</span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border p-2.5 bg-muted/30">
              <p className="text-[10px] text-muted-foreground">
                <span className="font-semibold">Design A</span> will be your current design. <span className="font-semibold">Design B</span> starts as a copy — edit it via the API to set a different theme.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={creating || !newTestName.trim()}>
              {creating ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Creating...</> : <><Plus className="h-3.5 w-3.5 mr-1" />Create Test</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
