"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Network, Globe, Server, Shield, Zap, Activity,
  Search, Wifi, Lock, Radio, HardDrive,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Tab = "subnets" | "leases" | "dns-zones" | "dns-records" | "firewall" | "wan" | "vpn";

export function NetworkPanel() {
  const [tab, setTab] = React.useState<Tab>("subnets");

  const tabs: { id: Tab; label: string; icon: typeof Network }[] = [
    { id: "subnets", label: "DHCP Subnets", icon: Network },
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
      {tab === "leases" && <DhcpLeasesTab />}
      {tab === "dns-zones" && <DnsZonesTab />}
      {tab === "dns-records" && <DnsRecordsTab />}
      {tab === "firewall" && <PlaceholderTab title="Firewall Rules" desc="nftables rules management — accept/drop/reject by IP/port/protocol" />}
      {tab === "wan" && <PlaceholderTab title="Multi-WAN Links" desc="ECMP load balancing + failover across WAN uplinks" />}
      {tab === "vpn" && <PlaceholderTab title="VPN Tunnels" desc="IPsec/WireGuard tunnel management" />}
    </div>
  );
}

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

function DnsRecordsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["dns-records"],
    queryFn: async () => { const res = await fetch("/api/dns/records"); if (!res.ok) throw new Error("Failed"); return res.json(); },
  });

  const records: any[] = data?.records || [];

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Server className="size-4 text-primary" /> DNS Records (BIND zone file entries)</CardTitle></CardHeader>
      <CardContent className="p-0">
        {isLoading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Hostname</TableHead><TableHead>Zone</TableHead><TableHead>Type</TableHead>
                <TableHead>Value</TableHead><TableHead>TTL</TableHead><TableHead>Status</TableHead>
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
                  </TableRow>
                ))}
                {records.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No DNS records. Create a zone first, then add records.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PlaceholderTab({ title, desc }: { title: string; desc: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 gap-2">
        <Shield className="size-12 text-muted-foreground/40" />
        <h3 className="text-base font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground text-center max-w-md">{desc}</p>
      </CardContent>
    </Card>
  );
}

function LoadingSpinner() {
  return <div className="flex justify-center py-8"><div className="size-6 rounded-full border-2 border-primary border-t-transparent cryptsk-spin" /></div>;
}
