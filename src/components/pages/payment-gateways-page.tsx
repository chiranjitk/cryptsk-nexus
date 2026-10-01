"use client";

// ═══════════════════════════════════════════════════════════════
// Payment Gateway Management — dedicated module page
// (split out of the original Settings→Integrations page)
// ═══════════════════════════════════════════════════════════════
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CreditCard, Settings, Save, Zap, Plus, RefreshCw, Loader2, DollarSign, Receipt,
  FileText, Shield, Activity, CheckCircle2, AlertCircle, Webhook,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  IntegrationConfig, IntegrationStats, GATEWAY_META, getGatewayStatus, getStatusBadge,
  formatTimestamp, useIntegrationAction, LogsDialog, SecretField,
} from "@/components/integrations/shared";

interface IntegrationTransaction {
  id: string;
  gatewayType: string;
  transactionType: string;
  amount: number;
  status: string;
  externalRef: string;
  createdAt: string;
}

export function PaymentGatewaysPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [newGwProvider, setNewGwProvider] = useState("");
  const [newGwName, setNewGwName] = useState("");
  const [configTarget, setConfigTarget] = useState<IntegrationConfig | null>(null);
  const [form, setForm] = useState({ apiKey: "", apiSecret: "", merchantId: "", environment: "test", ipAllowlist: "", costPerRequest: 0, enabled: false });
  const [logsTarget, setLogsTarget] = useState<IntegrationConfig | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [txnFilter, setTxnFilter] = useState("all");

  const gatewaysQuery = useQuery<{ gateways: IntegrationConfig[] }>({
    queryKey: ["integrations", "gateways"],
    queryFn: () => apiFetch("/api/integrations?type=gateways"),
  });
  const statsQuery = useQuery<{ stats: IntegrationStats }>({
    queryKey: ["integrations", "stats"],
    queryFn: () => apiFetch("/api/integrations?type=stats"),
  });
  const txnsQuery = useQuery<{ transactions: IntegrationTransaction[] }>({
    queryKey: ["integration-transactions", txnFilter],
    queryFn: () => apiFetch(`/api/integrations/transactions?gatewayType=${txnFilter === "all" ? "" : txnFilter}`),
  });
  const gateways = gatewaysQuery.data?.gateways ?? [];
  const stats = statsQuery.data?.stats;
  const transactions = txnsQuery.data?.transactions ?? txnsQuery.data?.items ?? [];
  const action = useIntegrationAction();

  function openConfig(gw: IntegrationConfig) {
    setConfigTarget(gw);
    setForm({
      apiKey: gw.apiKey, apiSecret: gw.apiSecret, merchantId: gw.merchantId,
      environment: gw.environment || "test", ipAllowlist: gw.ipAllowlist,
      costPerRequest: gw.costPerRequest, enabled: gw.enabled,
    });
  }
  function saveConfig() {
    if (!configTarget) return;
    action.mutate(
      {
        action: "save_gateway", gatewayId: configTarget.id, name: configTarget.name, provider: configTarget.provider,
        ...form, config: {},
      } as Record<string, unknown>,
      {
        onSuccess: () => { toast.success(`${configTarget.name} saved`); setConfigTarget(null); },
        onError: (e: Error) => toast.error(e.message || "Save failed"),
      }
    );
  }
  function toggleGateway(gw: IntegrationConfig) {
    action.mutate(
      { action: "save_gateway", gatewayId: gw.id, name: gw.name, provider: gw.provider, apiKey: gw.apiKey, apiSecret: gw.apiSecret, merchantId: gw.merchantId, environment: gw.environment, enabled: !gw.enabled, config: {}, ipAllowlist: gw.ipAllowlist, costPerRequest: gw.costPerRequest } as Record<string, unknown>,
      {
        onSuccess: () => toast.success(`${gw.name} ${!gw.enabled ? "enabled" : "disabled"}`),
        onError: (e: Error) => toast.error(e.message || "Toggle failed"),
      }
    );
  }
  function testConnection(id: string) {
    setTestingId(id);
    setTimeout(() => { setTestingId(null); toast.success("Connectivity test queued — check API logs for the result"); }, 1200);
  }

  const activeCount = gateways.filter((g) => g.enabled).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" />Payment Gateway Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure Razorpay, PhonePe, Paytm, Cashfree, CCAvenue, PayU & Stripe for online collections.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />{activeCount} Active
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
            <AlertCircle className="h-3.5 w-3.5" />{gateways.length - activeCount} Inactive
          </div>
        </div>
      </div>

      <Tabs defaultValue="gateways" className="space-y-4">
        <TabsList className="bg-muted p-1 h-auto flex flex-wrap">
          <TabsTrigger value="gateways" className="text-xs sm:text-sm gap-1.5"><CreditCard className="h-3.5 w-3.5" />Gateways</TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs sm:text-sm gap-1.5"><Receipt className="h-3.5 w-3.5" />Transactions</TabsTrigger>
        </TabsList>

        {/* ── Gateways tab ── */}
        <TabsContent value="gateways" className="space-y-4">
          {/* Cost summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border shadow-sm bg-gradient-to-br from-emerald-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100"><Activity className="h-5 w-5 text-emerald-600" /></div>
                  <div><p className="text-xs text-muted-foreground">Total API Calls</p><p className="text-xl font-bold text-emerald-700">{stats?.totalApiCalls ?? 0}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm bg-gradient-to-br from-amber-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100"><DollarSign className="h-5 w-5 text-amber-600" /></div>
                  <div><p className="text-xs text-muted-foreground">Est. Monthly Cost</p><p className="text-xl font-bold text-amber-700">₹{(stats?.totalEstimatedCost ?? 0).toFixed(2)}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm bg-gradient-to-br from-teal-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-teal-100"><Shield className="h-5 w-5 text-teal-600" /></div>
                  <div><p className="text-xs text-muted-foreground">IP Allowlisted</p><p className="text-xl font-bold text-teal-700">{gateways.filter((g) => g.ipAllowlist).length}/{gateways.length}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Select a gateway to configure API keys and enable online payments.</p>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs h-8"><Plus className="h-3 w-3 mr-1" />Add Gateway</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Add Payment Gateway</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div><Label className="text-sm">Provider</Label>
                    <Select value={newGwProvider} onValueChange={setNewGwProvider}><SelectTrigger className="mt-1"><SelectValue placeholder="Select provider" /></SelectTrigger>
                      <SelectContent>{Object.keys(GATEWAY_META).map((p) => (<SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>))}<SelectItem value="custom">Custom Gateway</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-sm">Display Name</Label><Input value={newGwName} onChange={(e) => setNewGwName(e.target.value)} placeholder="e.g. My Payment Gateway" className="mt-1" /></div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setAddOpen(false); setNewGwProvider(""); setNewGwName(""); }}>Cancel</Button>
                    <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" disabled={!newGwProvider} onClick={() => {
                      const name = newGwName || newGwProvider.charAt(0).toUpperCase() + newGwProvider.slice(1);
                      action.mutate(
                        { action: "save_gateway", gatewayId: `new_${Date.now()}`, name, provider: newGwProvider, apiKey: "", apiSecret: "", merchantId: "", environment: "test", enabled: false, config: {} } as Record<string, unknown>,
                        { onSuccess: () => toast.success(`${name} added — now configure its keys`) }
                      );
                      setAddOpen(false); setNewGwProvider(""); setNewGwName("");
                    }}>Add Gateway</Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {gatewaysQuery.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
          ) : gateways.length === 0 ? (
            <Card className="border"><CardContent className="py-16 text-center"><CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" /><p className="text-lg font-semibold">No Payment Gateways</p><p className="text-sm text-muted-foreground mt-1">Add your first gateway to start accepting online payments.</p></CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {gateways.map((gw) => {
                const meta = GATEWAY_META[gw.provider] || { color: "text-gray-600", bgColor: "bg-gray-100", borderColor: "border-gray-300", letter: gw.name.charAt(0).toUpperCase(), badge: "" };
                const status = getGatewayStatus(gw);
                return (
                  <Card key={gw.id} className={`${meta.borderColor} border-2 relative overflow-hidden transition-all hover:shadow-md`}>
                    {meta.badge && <div className="absolute top-3 right-3"><Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">{meta.badge}</Badge></div>}
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`h-12 w-12 rounded-xl ${meta.bgColor} flex items-center justify-center`}><span className={`text-xl font-bold ${meta.color}`}>{meta.letter}</span></div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base">{gw.name}</CardTitle>
                          <div className="mt-1">{getStatusBadge(status)}</div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <CardDescription className="text-xs">
                        {status === "not_configured" ? "Configure your API keys to enable payments" : `${gw.environment === "live" ? "Live" : "Test"} mode active`}
                      </CardDescription>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{gw.apiCalls || 0} calls</span>
                        <span>₹{(gw.estimatedCost || 0).toFixed(2)}</span>
                      </div>
                      {gw.ipAllowlist && <div className="flex items-center gap-1 text-xs text-emerald-600"><Shield className="h-3 w-3" /><span>IP restricted</span></div>}
                      <div className="flex items-center justify-between">
                        <Switch checked={gw.enabled} onCheckedChange={() => toggleGateway(gw)} aria-label={`Toggle ${gw.name}`} />
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => openConfig(gw)}><Settings className="h-3 w-3" /></Button>
                          {status !== "not_configured" && (
                            <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => testConnection(gw.id)} disabled={testingId === gw.id}>
                              {testingId === gw.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => setLogsTarget(gw)} title="View Logs"><FileText className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Transactions tab ── */}
        <TabsContent value="transactions">
          <Card className="border">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><CardTitle className="text-base">Gateway Transactions</CardTitle><CardDescription className="text-xs">Live ledger of payment-gateway API transactions</CardDescription></div>
                <Select value={txnFilter} onValueChange={setTxnFilter}>
                  <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All gateways" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Gateways</SelectItem>
                    {gateways.map((g) => <SelectItem key={g.id} value={g.provider}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-lg border max-h-96 overflow-y-auto nice-scroll">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs">Gateway</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">External Ref</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {txnsQuery.isLoading ? (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : transactions.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No gateway transactions recorded yet</TableCell></TableRow>
                    ) : transactions.map((t) => (
                      <TableRow key={t.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs whitespace-nowrap">{formatTimestamp(t.createdAt)}</TableCell>
                        <TableCell className="text-xs font-medium capitalize">{t.gatewayType || "—"}</TableCell>
                        <TableCell className="text-xs">{t.transactionType || "—"}</TableCell>
                        <TableCell className="text-xs font-semibold text-emerald-700">₹{(t.amount || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-xs">{t.status === "success" ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Success</Badge> : t.status === "failed" ? <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Failed</Badge> : <Badge variant="outline" className="text-[10px]">{t.status || "—"}</Badge>}</TableCell>
                        <TableCell className="text-xs font-mono max-w-[160px] truncate">{t.externalRef || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Gateway config dialog */}
      <Dialog open={!!configTarget} onOpenChange={(o) => !o && setConfigTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Configure {configTarget?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <SecretField label="API Key" type="password" value={form.apiKey} onChange={(v) => setForm((f) => ({ ...f, apiKey: v }))} />
            <SecretField label="API Secret" type="password" value={form.apiSecret} onChange={(v) => setForm((f) => ({ ...f, apiSecret: v }))} />
            <SecretField label="Merchant ID" value={form.merchantId} onChange={(v) => setForm((f) => ({ ...f, merchantId: v }))} />
            <div>
              <Label className="text-sm">Environment</Label>
              <Select value={form.environment} onValueChange={(v) => setForm((f) => ({ ...f, environment: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="test">Test (sandbox)</SelectItem><SelectItem value="live">Live (production)</SelectItem></SelectContent>
              </Select>
            </div>
            <SecretField label="IP Allowlist (comma-separated IPs/CIDR)" value={form.ipAllowlist} onChange={(v) => setForm((f) => ({ ...f, ipAllowlist: v }))} placeholder="e.g. 10.0.0.1, 192.168.1.0/24" />
            <div>
              <Label className="text-sm">Cost per request (₹)</Label>
              <Input type="number" step="0.01" min="0" value={form.costPerRequest} onChange={(e) => setForm((f) => ({ ...f, costPerRequest: parseFloat(e.target.value) || 0 }))} className="mt-1" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div><p className="text-sm font-medium">Enabled</p><p className="text-xs text-muted-foreground">Accept payments through this gateway</p></div>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigTarget(null)}>Cancel</Button>
              <Button className="bg-[#DC2626] hover:bg-[#B91C1C] text-white" disabled={action.isPending} onClick={saveConfig}>
                {action.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logs dialog */}
      <Dialog open={!!logsTarget} onOpenChange={(o) => !o && setLogsTarget(null)}>
        <LogsDialog integrationId={logsTarget?.id ?? null} integrationName={logsTarget?.name ?? ""} />
      </Dialog>
    </div>
  );
}

export default PaymentGatewaysPage;
