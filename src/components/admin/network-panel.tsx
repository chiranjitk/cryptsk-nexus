"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Network, Globe, Server, Shield, Search, Wifi, Lock, HardDrive, Pin, Trash2, Copy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Tab = "subnets" | "reservations" | "leases" | "dns-zones" | "dns-records" | "firewall" | "wan" | "vpn";

// Badge color maps (outline variant + border/text classes)
const FIREWALL_ACTION_STYLES: Record<string, string> = {
  accept: "border-emerald-500/30 text-emerald-600",
  drop: "border-red-500/30 text-red-600",
  reject: "border-orange-500/30 text-orange-600",
  masquerade: "border-violet-500/30 text-violet-600",
  redirect: "border-amber-500/30 text-amber-600",
  log: "border-slate-400/30 text-slate-500",
};

const WAN_STATUS_STYLES: Record<string, string> = {
  up: "border-emerald-500/30 text-emerald-600",
  down: "border-red-500/30 text-red-600",
  degraded: "border-amber-500/30 text-amber-600",
  backup: "border-slate-400/30 text-slate-500",
};

const VPN_STATUS_STYLES: Record<string, string> = {
  up: "border-emerald-500/30 text-emerald-600",
  down: "border-slate-400/30 text-slate-500",
  connecting: "border-amber-500/30 text-amber-600",
  error: "border-red-500/30 text-red-600",
};

const VPN_TYPE_STYLES: Record<string, string> = {
  ipsec: "border-violet-500/30 text-violet-600",
  wireguard: "border-emerald-500/30 text-emerald-600",
  openvpn: "border-amber-500/30 text-amber-600",
};

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

async function apiRequest(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export function NetworkPanel() {
  const [tab, setTab] = React.useState<Tab>("subnets");

  const tabs: { id: Tab; label: string; icon: typeof Network }[] = [
    { id: "subnets", label: "DHCP Subnets", icon: Network },
    { id: "reservations", label: "DHCP Reservations", icon: Pin },
    { id: "leases", label: "DHCP Leases", icon: HardDrive },
    { id: "dns-zones", label: "DNS Zones", icon: Globe },
    { id: "dns-records", label: "DNS Records", icon: Server },
    { id: "firewall", label: "Firewall", icon: Shield },
    { id: "wan", label: "Multi-WAN", icon: Wifi },
    { id: "vpn", label: "VPN Tunnels", icon: Lock },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Network Management</h1>
        <p className="text-sm text-muted-foreground">
          Kea DHCP (v4+v6) + BIND/named DNS + nftables Firewall + Multi-WAN + VPN
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "subnets" && <DhcpSubnetsTab />}
      {tab === "reservations" && <DhcpReservationsTab />}
      {tab === "leases" && <DhcpLeasesTab />}
      {tab === "dns-zones" && <DnsZonesTab />}
      {tab === "dns-records" && <DnsRecordsTab />}
      {tab === "firewall" && <FirewallTab />}
      {tab === "wan" && <WanTab />}
      {tab === "vpn" && <VpnTab />}
    </div>
  );
}

// ============================================================
// Shared UI helpers
// ============================================================

function LoadingSpinner() {
  return <div className="flex justify-center py-8"><div className="size-6 rounded-full border-2 border-primary border-t-transparent cryptsk-spin" /></div>;
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function StatChip({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <div className={`rounded-md border bg-card px-3 py-2 ${className || ""}`}>
      <div className="text-lg font-semibold tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusFilterBar({ options, value, onChange }: {
  options: { id: string; label: string; count: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Status filter">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
            value === o.id ? "border-primary bg-primary text-primary-foreground" : "border-transparent hover:bg-muted"
          }`}
        >
          {o.label}
          <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${value === o.id ? "bg-primary-foreground/20" : "bg-muted"}`}>{o.count}</span>
        </button>
      ))}
    </div>
  );
}

function DeleteRowButton({ label, onConfirm, deleting }: { label: string; onConfirm: () => void; deleting?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          disabled={deleting}
          aria-label={`Delete ${label}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            This will permanently remove it from the configuration. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// DHCP Subnets
// ============================================================

function DhcpSubnetsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["dhcp-subnets"],
    queryFn: async () => {
      const res = await fetch("/api/dhcp/subnets");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const subnets: any[] = data?.subnets || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Network className="size-4 text-primary" /> DHCP Subnets (Kea v4+v6)</CardTitle>
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}><Plus className="size-4" /> Add Subnet</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Subnet Name</TableHead><TableHead>CIDR</TableHead><TableHead>Type</TableHead>
                <TableHead>Pool</TableHead><TableHead>Gateway</TableHead><TableHead>DNS</TableHead>
                <TableHead>Lease Time</TableHead><TableHead>Reservations</TableHead><TableHead>Leases</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {subnets.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm font-medium">{s.subnetName}</TableCell>
                    <TableCell className="text-xs font-mono">{s.subnet}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${s.ipType === "ipv6" ? "text-blue-600" : "text-emerald-600"}`}>{s.ipType}</Badge></TableCell>
                    <TableCell className="text-xs font-mono">{s.poolStart} - {s.poolEnd}</TableCell>
                    <TableCell className="text-xs font-mono">{s.gateway || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{s.dnsServers || "—"}</TableCell>
                    <TableCell className="text-xs tabular-nums">{s.validLifetime}s</TableCell>
                    <TableCell className="text-sm tabular-nums">{s._count?.reservations || 0}</TableCell>
                    <TableCell className="text-sm tabular-nums">{s._count?.leases || 0}</TableCell>
                  </TableRow>
                ))}
                {subnets.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">No DHCP subnets configured. Click "Add Subnet" to create one.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {showCreate && <CreateSubnetDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["dhcp-subnets"] }); }} />}
    </Card>
  );
}

function CreateSubnetDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [subnetName, setSubnetName] = React.useState("");
  const [subnet, setSubnet] = React.useState("10.0.0.0/24");
  const [ipType, setIpType] = React.useState("ipv4");
  const [poolStart, setPoolStart] = React.useState("10.0.0.100");
  const [poolEnd, setPoolEnd] = React.useState("10.0.0.200");
  const [gateway, setGateway] = React.useState("10.0.0.1");
  const [dnsServers, setDnsServers] = React.useState("10.0.0.1,8.8.8.8");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/dhcp/subnets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subnetName, subnet, ipType, poolStart, poolEnd, gateway, dnsServers }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      toast({ title: "DHCP subnet created" });
      onSaved();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader><DialogTitle>Create DHCP Subnet</DialogTitle><DialogDescription>Kea DHCPv4/v6 subnet configuration</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Subnet Name</Label><Input value={subnetName} onChange={(e) => setSubnetName(e.target.value)} required placeholder="Office-LAN-v4" className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">IP Type</Label>
              <select value={ipType} onChange={(e) => setIpType(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="ipv4">IPv4</option><option value="ipv6">IPv6</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Subnet CIDR</Label><Input value={subnet} onChange={(e) => setSubnet(e.target.value)} required className="h-9 font-mono" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Pool Start</Label><Input value={poolStart} onChange={(e) => setPoolStart(e.target.value)} required className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Pool End</Label><Input value={poolEnd} onChange={(e) => setPoolEnd(e.target.value)} required className="h-9 font-mono" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Gateway</Label><Input value={gateway} onChange={(e) => setGateway(e.target.value)} className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">DNS Servers</Label><Input value={dnsServers} onChange={(e) => setDnsServers(e.target.value)} className="h-9 font-mono" /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Create Subnet</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DHCP Reservations (static host reservations)
// ============================================================

function DhcpReservationsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["dhcp-reservations"],
    queryFn: async () => { const res = await fetch("/api/dhcp/reservations"); if (!res.ok) throw new Error("Failed"); return res.json(); },
    refetchInterval: 30000,
  });

  const reservations: any[] = data?.reservations || [];

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/api/dhcp/reservations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }) }),
    onSuccess: () => { toast({ title: "Reservation updated" }); qc.invalidateQueries({ queryKey: ["dhcp-reservations"] }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/dhcp/reservations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "DHCP reservation deleted" });
      qc.invalidateQueries({ queryKey: ["dhcp-reservations"] });
      qc.invalidateQueries({ queryKey: ["dhcp-subnets"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Pin className="size-4 text-primary" /> DHCP Reservations (Kea host reservations)</CardTitle>
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}><Plus className="size-4" /> Add Reservation</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <TableSkeleton /> : (
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>MAC Address</TableHead><TableHead>IP Address</TableHead><TableHead>Hostname</TableHead>
                <TableHead>Subnet</TableHead><TableHead>Type</TableHead><TableHead>Enabled</TableHead><TableHead className="w-12" />
              </TableRow></TableHeader>
              <TableBody>
                {reservations.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell className="text-xs font-mono font-medium">{r.macAddress}</TableCell>
                    <TableCell className="text-xs font-mono text-blue-600">{r.ipAddress}</TableCell>
                    <TableCell className="text-xs">{r.hostname || "—"}</TableCell>
                    <TableCell>
                      <div className="text-xs font-medium">{r.subnet?.subnetName || "—"}</div>
                      {r.subnet?.subnet && <div className="text-[10px] font-mono text-muted-foreground">{r.subnet.subnet}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] text-muted-foreground">{r.ipType}</Badge></TableCell>
                    <TableCell>
                      <Switch checked={r.isActive} onCheckedChange={(v) => toggleMutation.mutate({ id: r.id, isActive: v })} aria-label={`Toggle reservation ${r.macAddress}`} />
                    </TableCell>
                    <TableCell>
                      <DeleteRowButton
                        label={`reservation ${r.macAddress}`}
                        deleting={deleteMutation.isPending && deleteMutation.variables === r.id}
                        onConfirm={() => deleteMutation.mutate(r.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {reservations.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No static reservations. Click "Add Reservation" to pin an IP to a device MAC.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {showCreate && <CreateReservationDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["dhcp-reservations"] }); qc.invalidateQueries({ queryKey: ["dhcp-subnets"] }); }} />}
    </Card>
  );
}

function CreateReservationDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [subnetId, setSubnetId] = React.useState("");
  const [macAddress, setMacAddress] = React.useState("");
  const [ipAddress, setIpAddress] = React.useState("");
  const [hostname, setHostname] = React.useState("");
  const [gateway, setGateway] = React.useState("");

  const { data: subnetData } = useQuery({
    queryKey: ["dhcp-subnets"],
    queryFn: async () => { const res = await fetch("/api/dhcp/subnets"); if (!res.ok) throw new Error("Failed"); return res.json(); },
  });
  const subnets: any[] = subnetData?.subnets || [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subnetId) { toast({ title: "Validation", description: "Select a subnet first", variant: "destructive" }); return; }
    if (!MAC_REGEX.test(macAddress.trim())) { toast({ title: "Validation", description: "Invalid MAC address — expected format AA:BB:CC:DD:EE:FF", variant: "destructive" }); return; }
    try {
      const res = await fetch("/api/dhcp/reservations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subnetId, macAddress, ipAddress, hostname: hostname || undefined, gateway: gateway || undefined }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      toast({ title: "DHCP reservation created" });
      onSaved();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader><DialogTitle>Create DHCP Reservation</DialogTitle><DialogDescription>Pin a static IP to a device MAC address (Kea host reservation)</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs">Subnet</Label>
            <select value={subnetId} onChange={(e) => setSubnetId(e.target.value)} required className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select subnet…</option>
              {subnets.map((s) => <option key={s.id} value={s.id}>{s.subnetName} ({s.subnet})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">MAC Address</Label><Input value={macAddress} onChange={(e) => setMacAddress(e.target.value)} required placeholder="AA:BB:CC:DD:EE:FF" className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Reserved IP</Label><Input value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} required placeholder="10.0.0.50" className="h-9 font-mono" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Hostname</Label><Input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="office-pc" className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Gateway Override</Label><Input value={gateway} onChange={(e) => setGateway(e.target.value)} className="h-9 font-mono" /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Create Reservation</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DHCP Leases
// ============================================================

function DhcpLeasesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["dhcp-leases"],
    queryFn: async () => { const res = await fetch("/api/dhcp/leases"); if (!res.ok) throw new Error("Failed"); return res.json(); },
  });

  const leases: any[] = data?.leases || [];

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><HardDrive className="size-4 text-primary" /> DHCP Leases</CardTitle></CardHeader>
      <CardContent className="p-0">
        {isLoading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>MAC Address</TableHead><TableHead>IP Address</TableHead><TableHead>Type</TableHead>
                <TableHead>Hostname</TableHead><TableHead>Lease Start</TableHead><TableHead>Expires</TableHead><TableHead>State</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {leases.map((l) => (
                  <TableRow key={l.id} className="hover:bg-muted/50">
                    <TableCell className="text-xs font-mono">{l.macAddress}</TableCell>
                    <TableCell className="text-xs font-mono text-blue-600">{l.ipAddress}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${l.ipType === "ipv6" ? "text-blue-600" : "text-emerald-600"}`}>{l.ipType}</Badge></TableCell>
                    <TableCell className="text-xs">{l.hostname || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(l.leaseStart).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(l.leaseEnd).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${l.state === "active" ? "border-emerald-500/30 text-emerald-600" : "text-muted-foreground"}`}>{l.state}</Badge></TableCell>
                  </TableRow>
                ))}
                {leases.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No DHCP leases. Kea will populate this when clients connect.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// DNS Zones
// ============================================================

function DnsZonesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["dns-zones"],
    queryFn: async () => { const res = await fetch("/api/dns/zones"); if (!res.ok) throw new Error("Failed"); return res.json(); },
  });

  const zones: any[] = data?.zones || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Globe className="size-4 text-primary" /> DNS Zones (BIND/named)</CardTitle>
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}><Plus className="size-4" /> Add Zone</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Zone Name</TableHead><TableHead>Type</TableHead><TableHead>Primary NS</TableHead>
                <TableHead>Admin Email</TableHead><TableHead>Serial</TableHead><TableHead>Records</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {zones.map((z) => (
                  <TableRow key={z.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm font-mono font-medium">{z.zoneName}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{z.zoneType}</Badge></TableCell>
                    <TableCell className="text-xs font-mono">{z.primaryNs}</TableCell>
                    <TableCell className="text-xs">{z.adminEmail}</TableCell>
                    <TableCell className="text-xs tabular-nums">{z.serial}</TableCell>
                    <TableCell className="text-sm tabular-nums">{z._count?.records || 0}</TableCell>
                    <TableCell>{z.isActive ? <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">Active</Badge> : <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>}</TableCell>
                  </TableRow>
                ))}
                {zones.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No DNS zones configured. Click "Add Zone" to create one.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {showCreate && <CreateZoneDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["dns-zones"] }); }} />}
    </Card>
  );
}

function CreateZoneDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [zoneName, setZoneName] = React.useState("cryptsk.local");
  const [zoneType, setZoneType] = React.useState("forward");
  const [primaryNs, setPrimaryNs] = React.useState("ns1.cryptsk.com");
  const [adminEmail, setAdminEmail] = React.useState("admin.cryptsk.com");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/dns/zones", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneName, zoneType, primaryNs, adminEmail }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      toast({ title: "DNS zone created" });
      onSaved();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader><DialogTitle>Create DNS Zone</DialogTitle><DialogDescription>BIND/named zone configuration</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs">Zone Name</Label><Input value={zoneName} onChange={(e) => setZoneName(e.target.value)} required className="h-9 font-mono" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Zone Type</Label>
            <select value={zoneType} onChange={(e) => setZoneType(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="forward">Forward (A/AAAA)</option><option value="reverse">Reverse (PTR)</option>
            </select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Primary NS</Label><Input value={primaryNs} onChange={(e) => setPrimaryNs(e.target.value)} required className="h-9 font-mono" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Admin Email</Label><Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required className="h-9 font-mono" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Create Zone</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DNS Records
// ============================================================

function DnsRecordsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["dns-records"],
    queryFn: async () => { const res = await fetch("/api/dns/records"); if (!res.ok) throw new Error("Failed"); return res.json(); },
  });

  const records: any[] = data?.records || [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/dns/records/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "DNS record deleted" });
      qc.invalidateQueries({ queryKey: ["dns-records"] });
      qc.invalidateQueries({ queryKey: ["dns-zones"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Server className="size-4 text-primary" /> DNS Records (BIND zone file entries)</CardTitle></CardHeader>
      <CardContent className="p-0">
        {isLoading ? <TableSkeleton /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Hostname</TableHead><TableHead>Zone</TableHead><TableHead>Type</TableHead>
                <TableHead>Value</TableHead><TableHead>TTL</TableHead><TableHead>Status</TableHead><TableHead className="w-12" />
              </TableRow></TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm font-mono">{r.hostname}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.zone?.zoneName || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.recordType}</Badge></TableCell>
                    <TableCell className="text-xs font-mono text-blue-600">{r.value}</TableCell>
                    <TableCell className="text-xs tabular-nums">{r.ttl}s</TableCell>
                    <TableCell>{r.isActive ? <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">Active</Badge> : <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>}</TableCell>
                    <TableCell>
                      <DeleteRowButton
                        label={`record "${r.recordType} ${r.hostname}"`}
                        deleting={deleteMutation.isPending && deleteMutation.variables === r.id}
                        onConfirm={() => deleteMutation.mutate(r.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {records.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No DNS records. Create a zone first, then add records.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Firewall Rules (nftables / VPP ACL)
// ============================================================

function FirewallTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["firewall-rules", search, actionFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (actionFilter) params.set("action", actionFilter);
      const qs = params.toString();
      return apiRequest(`/api/firewall/rules${qs ? `?${qs}` : ""}`);
    },
    refetchInterval: 15000,
  });

  const rules: any[] = data?.rules || [];

  // Stat chips computed from the fetched list
  const enabledCount = rules.filter((r) => r.isActive).length;
  const actionCounts = rules.reduce((acc: Record<string, number>, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1;
    return acc;
  }, {});

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/api/firewall/rules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }) }),
    onSuccess: () => { toast({ title: "Firewall rule updated" }); qc.invalidateQueries({ queryKey: ["firewall-rules"] }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/firewall/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Firewall rule deleted" }); qc.invalidateQueries({ queryKey: ["firewall-rules"] }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Shield className="size-4 text-primary" /> Firewall Rules (nftables / VPP ACL)</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rules…" className="h-8 w-40 pl-8 text-xs" aria-label="Search firewall rules" />
            </div>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label="Filter by action">
              <option value="">All actions</option>
              <option value="accept">accept</option>
              <option value="drop">drop</option>
              <option value="reject">reject</option>
              <option value="masquerade">masquerade</option>
              <option value="redirect">redirect</option>
              <option value="log">log</option>
            </select>
            <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}><Plus className="size-4" /> New Rule</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-7">
          <StatChip label="Total Rules" value={rules.length} />
          <StatChip label="Enabled" value={enabledCount} className="border-emerald-500/30" />
          <StatChip label="Accept" value={actionCounts.accept || 0} />
          <StatChip label="Drop" value={actionCounts.drop || 0} />
          <StatChip label="Reject" value={actionCounts.reject || 0} />
          <StatChip label="Masquerade" value={actionCounts.masquerade || 0} />
          <StatChip label="Redirect" value={actionCounts.redirect || 0} />
        </div>
        {isLoading ? <TableSkeleton /> : (
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Priority</TableHead><TableHead>Name</TableHead><TableHead>Action</TableHead><TableHead>Direction</TableHead>
                <TableHead>Proto</TableHead><TableHead>Source → Destination</TableHead><TableHead>Ports</TableHead><TableHead>Enabled</TableHead><TableHead className="w-12" />
              </TableRow></TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm tabular-nums">{r.priority}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{r.ruleName}</div>
                      {r.description && <div className="text-[10px] text-muted-foreground">{r.description}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] capitalize ${FIREWALL_ACTION_STYLES[r.action] || ""}`}>{r.action}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.direction}</Badge></TableCell>
                    <TableCell className="text-xs uppercase">{r.protocol}</TableCell>
                    <TableCell className="text-xs font-mono">{r.srcIp || "any"} <span className="text-muted-foreground">→</span> {r.dstIp || "any"}</TableCell>
                    <TableCell className="text-xs font-mono">{r.srcPort || "—"} <span className="text-muted-foreground">→</span> {r.dstPort || "—"}</TableCell>
                    <TableCell>
                      <Switch checked={r.isActive} onCheckedChange={(v) => toggleMutation.mutate({ id: r.id, isActive: v })} aria-label={`Toggle rule ${r.ruleName}`} />
                    </TableCell>
                    <TableCell>
                      <DeleteRowButton
                        label={`rule "${r.ruleName}"`}
                        deleting={deleteMutation.isPending && deleteMutation.variables === r.id}
                        onConfirm={() => deleteMutation.mutate(r.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">No firewall rules{search || actionFilter ? " match the current filters" : ""}. Click "New Rule" to add one.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {showCreate && <CreateRuleDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["firewall-rules"] }); }} />}
    </Card>
  );
}

function CreateRuleDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [ruleName, setRuleName] = React.useState("");
  const [action, setAction] = React.useState("accept");
  const [direction, setDirection] = React.useState("ingress");
  const [protocol, setProtocol] = React.useState("tcp");
  const [srcIp, setSrcIp] = React.useState("");
  const [srcPort, setSrcPort] = React.useState("");
  const [dstIp, setDstIp] = React.useState("");
  const [dstPort, setDstPort] = React.useState("");
  const [inInterface, setInInterface] = React.useState("");
  const [outInterface, setOutInterface] = React.useState("");
  const [priority, setPriority] = React.useState("100");
  const [description, setDescription] = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ruleName.trim()) { toast({ title: "Validation", description: "Rule name is required", variant: "destructive" }); return; }
    const prio = Number(priority);
    if (!Number.isInteger(prio) || prio < 0) { toast({ title: "Validation", description: "Priority must be a non-negative integer", variant: "destructive" }); return; }
    if (srcPort && !/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(srcPort.trim())) { toast({ title: "Validation", description: "Source port must be a port, range or comma-separated list", variant: "destructive" }); return; }
    if (dstPort && !/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(dstPort.trim())) { toast({ title: "Validation", description: "Destination port must be a port, range or comma-separated list", variant: "destructive" }); return; }
    try {
      await apiRequest("/api/firewall/rules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleName: ruleName.trim(), action, direction, protocol,
          srcIp: srcIp || undefined, srcPort: srcPort || undefined,
          dstIp: dstIp || undefined, dstPort: dstPort || undefined,
          inInterface: inInterface || undefined, outInterface: outInterface || undefined,
          priority: prio, description: description || undefined,
        }),
      });
      toast({ title: "Firewall rule created" });
      onSaved();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader><DialogTitle>Create Firewall Rule</DialogTitle><DialogDescription>nftables / VPP ACL rule — lower priority evaluates first</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Rule Name</Label><Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} required placeholder="allow-web-ingress" className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Priority</Label><Input type="number" min={0} value={priority} onChange={(e) => setPriority(e.target.value)} required className="h-9 tabular-nums" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Action</Label>
              <select value={action} onChange={(e) => setAction(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="accept">accept</option><option value="drop">drop</option><option value="reject">reject</option>
                <option value="masquerade">masquerade</option><option value="redirect">redirect</option><option value="log">log</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Direction</Label>
              <select value={direction} onChange={(e) => setDirection(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="ingress">ingress</option><option value="egress">egress</option><option value="forward">forward</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Protocol</Label>
              <select value={protocol} onChange={(e) => setProtocol(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="tcp">tcp</option><option value="udp">udp</option><option value="icmp">icmp</option><option value="any">any</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Source IP / CIDR</Label><Input value={srcIp} onChange={(e) => setSrcIp(e.target.value)} placeholder="any / 10.0.0.0/24" className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Source Port(s)</Label><Input value={srcPort} onChange={(e) => setSrcPort(e.target.value)} placeholder="80,443 or 1024-65535" className="h-9 font-mono" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Destination IP / CIDR</Label><Input value={dstIp} onChange={(e) => setDstIp(e.target.value)} placeholder="any / 192.168.1.10" className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Destination Port(s)</Label><Input value={dstPort} onChange={(e) => setDstPort(e.target.value)} placeholder="443" className="h-9 font-mono" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">In Interface</Label><Input value={inInterface} onChange={(e) => setInInterface(e.target.value)} placeholder="eth0" className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Out Interface</Label><Input value={outInterface} onChange={(e) => setOutInterface(e.target.value)} placeholder="eth1" className="h-9 font-mono" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Create Rule</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Multi-WAN Links
// ============================================================

function WanTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["wan-links"],
    queryFn: () => apiRequest("/api/wan/links"),
    refetchInterval: 15000,
  });

  const links: any[] = data?.links || [];

  const statusCounts: Record<string, number> = { all: links.length, up: 0, down: 0, degraded: 0, backup: 0 };
  links.forEach((l) => { if (statusCounts[l.status] !== undefined) statusCounts[l.status] += 1; });
  const filtered = statusFilter === "all" ? links : links.filter((l) => l.status === statusFilter);

  const primaryMutation = useMutation({
    mutationFn: ({ id, isPrimary }: { id: string; isPrimary: boolean }) =>
      apiRequest(`/api/wan/links/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPrimary }) }),
    onSuccess: () => { toast({ title: "WAN link updated" }); qc.invalidateQueries({ queryKey: ["wan-links"] }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/wan/links/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "WAN link deleted" }); qc.invalidateQueries({ queryKey: ["wan-links"] }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Wifi className="size-4 text-primary" /> Multi-WAN Links (ECMP load balancing + failover)</CardTitle>
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}><Plus className="size-4" /> Add Link</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 pb-2">
          <StatusFilterBar
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { id: "all", label: "All", count: statusCounts.all },
              { id: "up", label: "Up", count: statusCounts.up },
              { id: "down", label: "Down", count: statusCounts.down },
              { id: "degraded", label: "Degraded", count: statusCounts.degraded },
              { id: "backup", label: "Backup", count: statusCounts.backup },
            ]}
          />
        </div>
        {isLoading ? <TableSkeleton /> : (
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Link Name</TableHead><TableHead>Interface</TableHead><TableHead>IP Address</TableHead><TableHead>Gateway</TableHead>
                <TableHead>Status</TableHead><TableHead>Primary</TableHead><TableHead>Weight</TableHead><TableHead>Latency / Loss</TableHead><TableHead className="w-12" />
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="text-sm font-medium">{l.linkName}</div>
                      {l.description && <div className="text-[10px] text-muted-foreground">{l.description}</div>}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{l.interface}</TableCell>
                    <TableCell className="text-xs font-mono text-blue-600">{l.ipAddress || "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{l.gateway || "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] capitalize ${WAN_STATUS_STYLES[l.status] || ""}`}>{l.status}</Badge></TableCell>
                    <TableCell>
                      <Switch checked={l.isPrimary} onCheckedChange={(v) => primaryMutation.mutate({ id: l.id, isPrimary: v })} aria-label={`Toggle primary ${l.linkName}`} />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{l.weight}</TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {l.latencyMs != null ? `${l.latencyMs} ms` : "—"} / {l.packetLoss != null ? `${l.packetLoss}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <DeleteRowButton
                        label={`WAN link "${l.linkName}"`}
                        deleting={deleteMutation.isPending && deleteMutation.variables === l.id}
                        onConfirm={() => deleteMutation.mutate(l.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">No WAN links{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}. Click "Add Link" to register an uplink.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {showCreate && <CreateWanLinkDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["wan-links"] }); }} />}
    </Card>
  );
}

function CreateWanLinkDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [linkName, setLinkName] = React.useState("");
  const [interfaceName, setInterfaceName] = React.useState("");
  const [ipAddress, setIpAddress] = React.useState("");
  const [gateway, setGateway] = React.useState("");
  const [subnet, setSubnet] = React.useState("");
  const [status, setStatus] = React.useState("down");
  const [isPrimary, setIsPrimary] = React.useState(false);
  const [weight, setWeight] = React.useState("1");
  const [description, setDescription] = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!linkName.trim()) { toast({ title: "Validation", description: "Link name is required", variant: "destructive" }); return; }
    if (!interfaceName.trim()) { toast({ title: "Validation", description: "Interface is required", variant: "destructive" }); return; }
    const w = Number(weight);
    if (!Number.isInteger(w) || w < 1) { toast({ title: "Validation", description: "Weight must be a positive integer", variant: "destructive" }); return; }
    try {
      await apiRequest("/api/wan/links", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkName: linkName.trim(), interface: interfaceName.trim(),
          ipAddress: ipAddress || undefined, gateway: gateway || undefined, subnet: subnet || undefined,
          status, isPrimary, weight: w, description: description || undefined,
        }),
      });
      toast({ title: "WAN link created" });
      onSaved();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader><DialogTitle>Create WAN Link</DialogTitle><DialogDescription>Register an uplink for Multi-WAN load balancing / failover</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Link Name</Label><Input value={linkName} onChange={(e) => setLinkName(e.target.value)} required placeholder="WAN1-Primary" className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Interface</Label><Input value={interfaceName} onChange={(e) => setInterfaceName(e.target.value)} required placeholder="eth0" className="h-9 font-mono" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">IP Address</Label><Input value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Gateway</Label><Input value={gateway} onChange={(e) => setGateway(e.target.value)} className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Subnet CIDR</Label><Input value={subnet} onChange={(e) => setSubnet(e.target.value)} className="h-9 font-mono" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Status</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="up">up</option><option value="down">down</option><option value="degraded">degraded</option><option value="backup">backup</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Weight (ECMP)</Label><Input type="number" min={1} value={weight} onChange={(e) => setWeight(e.target.value)} className="h-9 tabular-nums" /></div>
            <div className="flex items-end gap-2 pb-1.5">
              <Switch id="wan-primary" checked={isPrimary} onCheckedChange={setIsPrimary} />
              <Label htmlFor="wan-primary" className="text-xs cursor-pointer">Primary link</Label>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Create Link</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// VPN Tunnels
// ============================================================

function VpnTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["vpn-tunnels"],
    queryFn: () => apiRequest("/api/vpn/tunnels"),
    refetchInterval: 15000,
  });

  const tunnels: any[] = data?.tunnels || [];

  const statusCounts: Record<string, number> = { all: tunnels.length, up: 0, down: 0, connecting: 0, error: 0 };
  tunnels.forEach((t) => { if (statusCounts[t.status] !== undefined) statusCounts[t.status] += 1; });
  const filtered = statusFilter === "all" ? tunnels : tunnels.filter((t) => t.status === statusFilter);

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/api/vpn/tunnels/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }) }),
    onSuccess: () => { toast({ title: "VPN tunnel updated" }); qc.invalidateQueries({ queryKey: ["vpn-tunnels"] }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/vpn/tunnels/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "VPN tunnel deleted" }); qc.invalidateQueries({ queryKey: ["vpn-tunnels"] }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  async function copyPsk(tunnel: any) {
    try {
      const data = await apiRequest(`/api/vpn/tunnels/${tunnel.id}`);
      if (!data.tunnel?.psk) throw new Error("No PSK configured for this tunnel");
      await navigator.clipboard.writeText(data.tunnel.psk);
      toast({ title: "PSK copied to clipboard" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Lock className="size-4 text-primary" /> VPN Tunnels (IPsec / WireGuard / OpenVPN)</CardTitle>
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}><Plus className="size-4" /> New Tunnel</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 pb-2">
          <StatusFilterBar
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { id: "all", label: "All", count: statusCounts.all },
              { id: "up", label: "Up", count: statusCounts.up },
              { id: "down", label: "Down", count: statusCounts.down },
              { id: "connecting", label: "Connecting", count: statusCounts.connecting },
              { id: "error", label: "Error", count: statusCounts.error },
            ]}
          />
        </div>
        {isLoading ? <TableSkeleton /> : (
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tunnel Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
                <TableHead>Local → Remote Subnet</TableHead><TableHead>Remote Gateway</TableHead><TableHead>PSK</TableHead><TableHead>Enabled</TableHead><TableHead className="w-12" />
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="text-sm font-medium">{t.tunnelName}</div>
                      {t.description && <div className="text-[10px] text-muted-foreground">{t.description}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${VPN_TYPE_STYLES[t.type] || ""}`}>{t.type}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] capitalize ${VPN_STATUS_STYLES[t.status] || ""}`}>{t.status}</Badge></TableCell>
                    <TableCell className="text-xs font-mono">{t.localSubnet} <span className="text-muted-foreground">→</span> {t.remoteSubnet}</TableCell>
                    <TableCell className="text-xs font-mono text-blue-600">{t.remoteEndpoint}</TableCell>
                    <TableCell>
                      {t.hasPsk ? (
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs tracking-widest" aria-label="PSK hidden">••••••</span>
                          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={() => copyPsk(t)} aria-label={`Copy PSK for ${t.tunnelName}`}>
                            <Copy className="size-3" />
                          </Button>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Switch checked={t.isActive} onCheckedChange={(v) => activeMutation.mutate({ id: t.id, isActive: v })} aria-label={`Toggle tunnel ${t.tunnelName}`} />
                    </TableCell>
                    <TableCell>
                      <DeleteRowButton
                        label={`tunnel "${t.tunnelName}"`}
                        deleting={deleteMutation.isPending && deleteMutation.variables === t.id}
                        onConfirm={() => deleteMutation.mutate(t.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No VPN tunnels{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}. Click "New Tunnel" to create one.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {showCreate && <CreateTunnelDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["vpn-tunnels"] }); }} />}
    </Card>
  );
}

function CreateTunnelDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [tunnelName, setTunnelName] = React.useState("");
  const [type, setType] = React.useState("ipsec");
  const [localEndpoint, setLocalEndpoint] = React.useState("");
  const [localSubnet, setLocalSubnet] = React.useState("10.0.0.0/24");
  const [remoteEndpoint, setRemoteEndpoint] = React.useState("");
  const [remoteSubnet, setRemoteSubnet] = React.useState("192.168.1.0/24");
  const [ikeVersion, setIkeVersion] = React.useState("2");
  const [encryption, setEncryption] = React.useState("aes256");
  const [hash, setHash] = React.useState("sha256");
  const [dhGroup, setDhGroup] = React.useState("14");
  const [psk, setPsk] = React.useState("");
  const [description, setDescription] = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tunnelName.trim()) { toast({ title: "Validation", description: "Tunnel name is required", variant: "destructive" }); return; }
    if (!localEndpoint.trim() || !remoteEndpoint.trim()) { toast({ title: "Validation", description: "Local and remote endpoints are required", variant: "destructive" }); return; }
    if (!localSubnet.trim() || !remoteSubnet.trim()) { toast({ title: "Validation", description: "Local and remote subnets are required", variant: "destructive" }); return; }
    try {
      await apiRequest("/api/vpn/tunnels", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tunnelName: tunnelName.trim(), type,
          localEndpoint: localEndpoint.trim(), localSubnet: localSubnet.trim(),
          remoteEndpoint: remoteEndpoint.trim(), remoteSubnet: remoteSubnet.trim(),
          ...(type === "ipsec" ? { ikeVersion: Number(ikeVersion), encryption, hash, dhGroup } : {}),
          psk: psk || undefined, description: description || undefined,
        }),
      });
      toast({ title: "VPN tunnel created" });
      onSaved();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader><DialogTitle>Create VPN Tunnel</DialogTitle><DialogDescription>Site-to-site tunnel configuration</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Tunnel Name</Label><Input value={tunnelName} onChange={(e) => setTunnelName(e.target.value)} required placeholder="HQ-Branch1" className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Type</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="ipsec">IPsec</option><option value="wireguard">WireGuard</option><option value="openvpn">OpenVPN</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Local Endpoint</Label><Input value={localEndpoint} onChange={(e) => setLocalEndpoint(e.target.value)} required placeholder="203.0.113.2" className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Remote Gateway</Label><Input value={remoteEndpoint} onChange={(e) => setRemoteEndpoint(e.target.value)} required placeholder="198.51.100.10" className="h-9 font-mono" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Local Subnet</Label><Input value={localSubnet} onChange={(e) => setLocalSubnet(e.target.value)} required className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Remote Subnet</Label><Input value={remoteSubnet} onChange={(e) => setRemoteSubnet(e.target.value)} required className="h-9 font-mono" /></div>
          </div>
          {type === "ipsec" && (
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">IKE Version</Label>
                <select value={ikeVersion} onChange={(e) => setIkeVersion(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="2">IKEv2</option><option value="1">IKEv1</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Encryption</Label>
                <select value={encryption} onChange={(e) => setEncryption(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="aes256">aes256</option><option value="aes128">aes128</option><option value="3des">3des</option><option value="chacha20">chacha20</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Hash</Label>
                <select value={hash} onChange={(e) => setHash(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="sha256">sha256</option><option value="sha1">sha1</option><option value="md5">md5</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">DH Group</Label>
                <select value={dhGroup} onChange={(e) => setDhGroup(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="14">14 (2048-bit)</option><option value="5">5 (1536-bit)</option><option value="2">2 (1024-bit)</option>
                </select>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">{type === "wireguard" ? "Preshared Key (optional)" : "Pre-Shared Key"}</Label><Input type="password" value={psk} onChange={(e) => setPsk(e.target.value)} className="h-9 font-mono" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9" /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Create Tunnel</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
