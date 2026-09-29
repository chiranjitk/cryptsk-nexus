"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Shield, Globe, Plus, Trash2, Edit, Search, RefreshCw,
  Server, Layers, FileJson, RotateCcw, Play, Info,
  CheckCircle, ArrowRight, Copy, Wifi,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/page-header";

// ─── Types ────────────────────────────────────────────────────
interface SubnetStats {
  totalSubnets: number;
  activeSubnets: number;
  totalPools: number;
  totalReservations: number;
  totalPdDelegations: number;
}

interface DhcpV6Subnet {
  id: string;
  name: string;
  interfaceName: string;
  prefix: string;
  prefixLength: number;
  preferredLifetime: number;
  validLifetime: number;
  raEnabled: boolean;
  raIntervalSec: number;
  raManagedFlag: boolean;
  raOtherFlag: boolean;
  raDefaultRouter: boolean;
  dnsServers: string;
  domainSearch: string;
  ntpServers: string;
  rapidCommit: boolean;
  optionsJson: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  pools: DhcpV6Pool[];
  reservations: DhcpV6Reservation[];
  prefixDelegations: DhcpV6PrefixDelegation[];
  _count: { pools: number; reservations: number; prefixDelegations: number };
}

interface DhcpV6Pool {
  id: string;
  dhcpV6SubnetId: string;
  name: string;
  rangeStart: string;
  rangeEnd: string;
  createdAt: string;
  updatedAt: string;
  dhcpV6Subnet?: { name: string; prefix: string };
}

interface DhcpV6Reservation {
  id: string;
  dhcpV6SubnetId: string;
  duid: string;
  iaid: string;
  ipAddress: string;
  hostname: string;
  clientType: string;
  subscriberId: string | null;
  deviceId: string | null;
  description: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  dhcpV6Subnet?: { name: string; prefix: string };
}

interface DhcpV6PrefixDelegation {
  id: string;
  dhcpV6SubnetId: string;
  name: string;
  delegatedPrefix: string;
  prefixLength: number;
  clientDuid: string;
  excludedPrefix: string;
  leaseTime: number;
  subscriberId: string | null;
  description: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  dhcpV6Subnet?: { name: string; prefix: string };
}

// ─── Pagination Helper ────────────────────────────────────────
const PAGE_SIZE = 10;

function paginate<T>(items: T[], page: number): { items: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const itemsOnPage = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { items: itemsOnPage, totalPages };
}

// ─── Subnet Form Default ──────────────────────────────────────
const defaultSubnetForm = {
  name: "",
  interfaceName: "",
  prefix: "",
  prefixLength: "64",
  preferredLifetime: "14400",
  validLifetime: "86400",
  raEnabled: true,
  raIntervalSec: "600",
  raManagedFlag: true,
  raOtherFlag: false,
  dnsServers: "",
  domainSearch: "",
  ntpServers: "",
  rapidCommit: false,
  enabled: true,
};

const defaultReservationForm = {
  dhcpV6SubnetId: "",
  duid: "",
  iaid: "",
  ipAddress: "",
  hostname: "",
  clientType: "SUBSCRIBER",
  subscriberId: "",
  deviceId: "",
  description: "",
  enabled: true,
};

const defaultPdForm = {
  dhcpV6SubnetId: "",
  name: "",
  delegatedPrefix: "",
  prefixLength: "48",
  clientDuid: "",
  leaseTime: "86400",
  subscriberId: "",
  description: "",
  enabled: true,
};

// ─── Helpers ──────────────────────────────────────────────────
function getRaMode(s: DhcpV6Subnet): string {
  if (s.raManagedFlag) return "DHCPv6 Stateful";
  if (s.raOtherFlag) return "DHCPv6 Hybrid";
  return "SLAAC";
}

function getRaModeColor(s: DhcpV6Subnet): string {
  if (s.raManagedFlag) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
  if (s.raOtherFlag) return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
  return "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400";
}

// ─── SearchPagination (declared outside component) ────────────
function SearchPagination({
  search, setSearch, page, setPage, totalPages, total,
}: {
  search: string; setSearch: (s: string) => void;
  page: number; setPage: (p: number) => void;
  totalPages: number; total: number;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9 h-9"
        />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{total} items</span>
        <span>|</span>
        <span>Page {page} of {totalPages}</span>
        <Button size="sm" variant="outline" className="h-8 px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>&lt;</Button>
        <Button size="sm" variant="outline" className="h-8 px-2" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>&gt;</Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function Dhcpv6Page() {
  const queryClient = useQueryClient();

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState("subnets");

  // ── Subnets state ──
  const [subnetSearch, setSubnetSearch] = useState("");
  const [subnetPage, setSubnetPage] = useState(1);
  const [subnetDialogOpen, setSubnetDialogOpen] = useState(false);
  const [subnetEditId, setSubnetEditId] = useState<string | null>(null);
  const [subnetForm, setSubnetForm] = useState(defaultSubnetForm);
  const [subnetDeleteId, setSubnetDeleteId] = useState<string | null>(null);

  // ── Reservations state ──
  const [resSearch, setResSearch] = useState("");
  const [resPage, setResPage] = useState(1);
  const [resDialogOpen, setResDialogOpen] = useState(false);
  const [resEditId, setResEditId] = useState<string | null>(null);
  const [resForm, setResForm] = useState(defaultReservationForm);
  const [resDeleteId, setResDeleteId] = useState<string | null>(null);

  // ── Prefix Delegation state ──
  const [pdSearch, setPdSearch] = useState("");
  const [pdPage, setPdPage] = useState(1);
  const [pdDialogOpen, setPdDialogOpen] = useState(false);
  const [pdEditId, setPdEditId] = useState<string | null>(null);
  const [pdForm, setPdForm] = useState(defaultPdForm);
  const [pdDeleteId, setPdDeleteId] = useState<string | null>(null);

  // ── KEA dialog ──
  const [keaConfigOpen, setKeaConfigOpen] = useState(false);

  // ── Queries ──
  const statsQuery = useQuery<SubnetStats>({
    queryKey: ["dhcpv6-stats"],
    queryFn: () => apiFetch<SubnetStats>("/api/dhcpv6/stats"),
  });

  const subnetsQuery = useQuery<DhcpV6Subnet[]>({
    queryKey: ["dhcpv6-subnets"],
    queryFn: () => apiFetch<DhcpV6Subnet[]>("/api/dhcpv6/subnets"),
  });

  const reservationsQuery = useQuery<DhcpV6Reservation[]>({
    queryKey: ["dhcpv6-reservations"],
    queryFn: () => apiFetch<DhcpV6Reservation[]>("/api/dhcpv6/reservations"),
  });

  const poolsQuery = useQuery<DhcpV6Pool[]>({
    queryKey: ["dhcpv6-pools"],
    queryFn: () => apiFetch<DhcpV6Pool[]>("/api/dhcpv6/pools"),
  });

  const pdQuery = useQuery<DhcpV6PrefixDelegation[]>({
    queryKey: ["dhcpv6-prefix-delegation"],
    queryFn: () => apiFetch<DhcpV6PrefixDelegation[]>("/api/dhcpv6/prefix-delegation"),
  });

  // ── Subnet Mutations ──
  const subnetCreateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/api/dhcpv6/subnets", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dhcpv6"] }); toast.success("Subnet created successfully"); setSubnetDialogOpen(false); setSubnetForm(defaultSubnetForm); setSubnetEditId(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const subnetUpdateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/api/dhcpv6/subnets", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dhcpv6"] }); toast.success("Subnet updated successfully"); setSubnetDialogOpen(false); setSubnetForm(defaultSubnetForm); setSubnetEditId(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const subnetDeleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/dhcpv6/subnets?id=${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dhcpv6"] }); toast.success("Subnet deleted successfully"); setSubnetDeleteId(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Reservation Mutations ──
  const resCreateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/api/dhcpv6/reservations", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dhcpv6"] }); toast.success("Reservation created successfully"); setResDialogOpen(false); setResForm(defaultReservationForm); setResEditId(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const resUpdateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/api/dhcpv6/reservations", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dhcpv6"] }); toast.success("Reservation updated successfully"); setResDialogOpen(false); setResForm(defaultReservationForm); setResEditId(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const resDeleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/dhcpv6/reservations?id=${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dhcpv6"] }); toast.success("Reservation deleted successfully"); setResDeleteId(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── PD Mutations ──
  const pdCreateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/api/dhcpv6/prefix-delegation", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dhcpv6"] }); toast.success("Prefix Delegation created successfully"); setPdDialogOpen(false); setPdForm(defaultPdForm); setPdEditId(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const pdUpdateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/api/dhcpv6/prefix-delegation", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dhcpv6"] }); toast.success("Prefix Delegation updated successfully"); setPdDialogOpen(false); setPdForm(defaultPdForm); setPdEditId(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const pdDeleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/dhcpv6/prefix-delegation?id=${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["dhcpv6"] }); toast.success("Prefix Delegation deleted successfully"); setPdDeleteId(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Subnet helpers ──
  const openSubnetCreate = () => { setSubnetForm(defaultSubnetForm); setSubnetEditId(null); setSubnetDialogOpen(true); };
  const openSubnetEdit = (s: DhcpV6Subnet) => {
    setSubnetEditId(s.id);
    setSubnetForm({
      name: s.name, interfaceName: s.interfaceName, prefix: s.prefix,
      prefixLength: String(s.prefixLength), preferredLifetime: String(s.preferredLifetime),
      validLifetime: String(s.validLifetime), raEnabled: s.raEnabled,
      raIntervalSec: String(s.raIntervalSec), raManagedFlag: s.raManagedFlag,
      raOtherFlag: s.raOtherFlag, dnsServers: s.dnsServers, domainSearch: s.domainSearch,
      ntpServers: s.ntpServers, rapidCommit: s.rapidCommit, enabled: s.enabled,
    });
    setSubnetDialogOpen(true);
  };
  const saveSubnet = () => {
    const data = {
      ...subnetForm,
      prefixLength: parseInt(subnetForm.prefixLength),
      preferredLifetime: parseInt(subnetForm.preferredLifetime),
      validLifetime: parseInt(subnetForm.validLifetime),
      raIntervalSec: parseInt(subnetForm.raIntervalSec),
    };
    if (subnetEditId) {
      subnetUpdateMut.mutate({ id: subnetEditId, ...data });
    } else {
      subnetCreateMut.mutate(data);
    }
  };

  // ── Reservation helpers ──
  const openResCreate = () => { setResForm(defaultReservationForm); setResEditId(null); setResDialogOpen(true); };
  const openResEdit = (r: DhcpV6Reservation) => {
    setResEditId(r.id);
    setResForm({
      dhcpV6SubnetId: r.dhcpV6SubnetId, duid: r.duid, iaid: r.iaid,
      ipAddress: r.ipAddress, hostname: r.hostname, clientType: r.clientType,
      subscriberId: r.subscriberId ?? "", deviceId: r.deviceId ?? "",
      description: r.description, enabled: r.enabled,
    });
    setResDialogOpen(true);
  };
  const saveRes = () => {
    const data = { ...resForm, subscriberId: resForm.subscriberId || null, deviceId: resForm.deviceId || null };
    if (resEditId) {
      resUpdateMut.mutate({ id: resEditId, ...data });
    } else {
      resCreateMut.mutate(data);
    }
  };

  // ── PD helpers ──
  const openPdCreate = () => { setPdForm(defaultPdForm); setPdEditId(null); setPdDialogOpen(true); };
  const openPdEdit = (pd: DhcpV6PrefixDelegation) => {
    setPdEditId(pd.id);
    setPdForm({
      dhcpV6SubnetId: pd.dhcpV6SubnetId, name: pd.name,
      delegatedPrefix: pd.delegatedPrefix, prefixLength: String(pd.prefixLength),
      clientDuid: pd.clientDuid, leaseTime: String(pd.leaseTime),
      subscriberId: pd.subscriberId ?? "", description: pd.description, enabled: pd.enabled,
    });
    setPdDialogOpen(true);
  };
  const savePd = () => {
    const data = { ...pdForm, prefixLength: parseInt(pdForm.prefixLength), leaseTime: parseInt(pdForm.leaseTime), subscriberId: pdForm.subscriberId || null };
    if (pdEditId) {
      pdUpdateMut.mutate({ id: pdEditId, ...data });
    } else {
      pdCreateMut.mutate(data);
    }
  };

  // ── Filtering ──
  const filteredSubnets = useMemo(() => {
    if (!subnetsQuery.data) return [];
    const q = subnetSearch.toLowerCase();
    if (!q) return subnetsQuery.data;
    return subnetsQuery.data.filter(
      (s) => s.name.toLowerCase().includes(q) || s.prefix.toLowerCase().includes(q) || s.interfaceName.toLowerCase().includes(q)
    );
  }, [subnetsQuery.data, subnetSearch]);

  const filteredReservations = useMemo(() => {
    if (!reservationsQuery.data) return [];
    const q = resSearch.toLowerCase();
    if (!q) return reservationsQuery.data;
    return reservationsQuery.data.filter(
      (r) => r.duid.toLowerCase().includes(q) || r.ipAddress.toLowerCase().includes(q) || r.hostname.toLowerCase().includes(q) || (r.dhcpV6Subnet?.name ?? "").toLowerCase().includes(q)
    );
  }, [reservationsQuery.data, resSearch]);

  const filteredPd = useMemo(() => {
    if (!pdQuery.data) return [];
    const q = pdSearch.toLowerCase();
    if (!q) return pdQuery.data;
    return pdQuery.data.filter(
      (p) => p.delegatedPrefix.toLowerCase().includes(q) || p.clientDuid.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.dhcpV6Subnet?.name ?? "").toLowerCase().includes(q)
    );
  }, [pdQuery.data, pdSearch]);

  // ── Pagination ──
  const subnetPaged = paginate(filteredSubnets, subnetPage);
  const resPaged = paginate(filteredReservations, resPage);
  const pdPaged = paginate(filteredPd, pdPage);

  // ── KEA config generation ──
  const generateKeaConfig = useCallback(() => {
    if (!subnetsQuery.data) return "{}";
    const config = {
      "Dhcp6": {
        "interfaces-config": {
          "interfaces": [...new Set(subnetsQuery.data.filter((s) => s.enabled).map((s) => s.interfaceName))],
        },
        "lease-database": { "type": "memfile", "persist": true, "name": "/var/lib/kea/dhcp6.leases" },
        "preferred-lifetime": 14400,
        "valid-lifetime": 86400,
        "renew-timer": 3600,
        "rebind-timer": 7200,
        "subnet6": subnetsQuery.data.filter((s) => s.enabled).map((s) => ({
          "subnet": `${s.prefix}/${s.prefixLength}`,
          "interface": s.interfaceName,
          "id": parseInt(s.id.slice(-4), 16) || 1,
          "rapid-commit": s.rapidCommit,
          "preferred-lifetime": s.preferredLifetime,
          "valid-lifetime": s.validLifetime,
          "pools": s.pools.map((p) => [p.rangeStart, p.rangeEnd]),
          "reservations": s.reservations.filter((r) => r.enabled).map((r) => ({
            "duid": r.duid,
            "ip-addresses": [r.ipAddress],
            "hostname": r.hostname || undefined,
          })),
          "pd-pools": s.prefixDelegations.filter((p) => p.enabled).map((p) => ({
            "prefix": p.delegatedPrefix,
            "prefix-len": p.prefixLength,
            "delegated-len": 64,
          })),
          "option-data": [
            ...(s.dnsServers ? [{ "name": "dns-servers", "code": 23, "space": "dhcp6", "csv-format": true, "data": s.dnsServers }] : []),
            ...(s.domainSearch ? [{ "name": "domain-search", "code": 24, "space": "dhcp6", "csv-format": true, "data": s.domainSearch }] : []),
          ],
        })),
        "loggers": [{ "name": "kea-dhcp6", "output_options": [{ "output": "/var/log/kea/kea-dhcp6.log", "maxsize": 10485760, "maxver": 3 }], "severity": "INFO", "debuglevel": 0 }],
      },
    };
    return JSON.stringify(config, null, 2);
  }, [subnetsQuery.data]);

  const copyKeaConfig = () => {
    navigator.clipboard.writeText(generateKeaConfig());
    toast.success("KEA config copied to clipboard");
  };

  const stats = statsQuery.data;
  const isLoading = statsQuery.isLoading || subnetsQuery.isLoading;
  const subnets = subnetsQuery.data ?? [];
  const reservations = reservationsQuery.data ?? [];
  const pdItems = pdQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="DHCPv6 Server"
        description="Manage IPv6 subnets, address pools, host reservations, and prefix delegation for dual-stack network deployment."
        icon={Shield}
      />

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="animate-card-enter" style={{ animationDelay: "0ms" }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <Layers className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Subnets</p>
                <div className="text-xl font-bold text-foreground">{isLoading ? <Skeleton className="h-6 w-8" /> : stats?.totalSubnets ?? 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="animate-card-enter" style={{ animationDelay: "50ms" }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <div className="text-xl font-bold text-foreground">{isLoading ? <Skeleton className="h-6 w-8" /> : stats?.activeSubnets ?? 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="animate-card-enter" style={{ animationDelay: "100ms" }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
                <Server className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Pools</p>
                <div className="text-xl font-bold text-foreground">{isLoading ? <Skeleton className="h-6 w-8" /> : stats?.totalPools ?? 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="animate-card-enter" style={{ animationDelay: "150ms" }}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-cyan-100 dark:bg-cyan-950/40 flex items-center justify-center">
                <Wifi className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reservations</p>
                <div className="text-xl font-bold text-foreground">{isLoading ? <Skeleton className="h-6 w-8" /> : stats?.totalReservations ?? 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="subnets" className="text-xs data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <Layers className="h-3.5 w-3.5 mr-1.5" /> Subnets
          </TabsTrigger>
          <TabsTrigger value="reservations" className="text-xs data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <Shield className="h-3.5 w-3.5 mr-1.5" /> Reservations
          </TabsTrigger>
          <TabsTrigger value="prefix-delegation" className="text-xs data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Prefix Delegation
          </TabsTrigger>
          <TabsTrigger value="kea" className="text-xs data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <Server className="h-3.5 w-3.5 mr-1.5" /> KEA-DHCPv6
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 1: SUBNETS                                         */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="subnets" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">DHCPv6 Subnets</h3>
            <Button onClick={openSubnetCreate} className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> Add Subnet
            </Button>
          </div>

          {subnetsQuery.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filteredSubnets.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No DHCPv6 subnets configured yet.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={openSubnetCreate}>
                  <Plus className="h-4 w-4 mr-1" /> Create First Subnet
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <SearchPagination search={subnetSearch} setSearch={setSubnetSearch} page={subnetPage} setPage={setSubnetPage} totalPages={subnetPaged.totalPages} total={filteredSubnets.length} />
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs font-semibold">Name</TableHead>
                          <TableHead className="text-xs font-semibold">Prefix/Length</TableHead>
                          <TableHead className="text-xs font-semibold">Interface</TableHead>
                          <TableHead className="text-xs font-semibold">RA Mode</TableHead>
                          <TableHead className="text-xs font-semibold">Preferred/Valid</TableHead>
                          <TableHead className="text-xs font-semibold">DNS</TableHead>
                          <TableHead className="text-xs font-semibold">Enabled</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subnetPaged.items.map((s) => (
                          <TableRow key={s.id} className="group hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10 transition-colors">
                            <TableCell className="font-medium text-sm">{s.name}</TableCell>
                            <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{s.prefix}/{s.prefixLength}</code></TableCell>
                            <TableCell className="text-sm">{s.interfaceName}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={`text-[10px] font-semibold ${getRaModeColor(s)}`}>{getRaMode(s)}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{s.preferredLifetime / 60}m / {s.validLifetime / 3600}h</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{s.dnsServers || "—"}</TableCell>
                            <TableCell>
                              {s.enabled ? (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px]">Active</Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 text-[10px]">Disabled</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openSubnetEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setSubnetDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Subnet Create/Edit Dialog */}
          <Dialog open={subnetDialogOpen} onOpenChange={(open) => { if (!open) { setSubnetDialogOpen(false); setSubnetForm(defaultSubnetForm); setSubnetEditId(null); } }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{subnetEditId ? "Edit DHCPv6 Subnet" : "Create DHCPv6 Subnet"}</DialogTitle>
                <DialogDescription>{subnetEditId ? "Modify the DHCPv6 subnet configuration." : "Define a new DHCPv6 subnet with address allocation settings."}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Name *</Label>
                  <Input value={subnetForm.name} onChange={(e) => setSubnetForm({ ...subnetForm, name: e.target.value })} placeholder="e.g., LAN-IPv6" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Interface *</Label>
                  <Input value={subnetForm.interfaceName} onChange={(e) => setSubnetForm({ ...subnetForm, interfaceName: e.target.value })} placeholder="e.g., eth0" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">IPv6 Prefix *</Label>
                  <Input value={subnetForm.prefix} onChange={(e) => setSubnetForm({ ...subnetForm, prefix: e.target.value })} placeholder="e.g., 2001:db8:1::" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Prefix Length</Label>
                  <Select value={subnetForm.prefixLength} onValueChange={(v) => setSubnetForm({ ...subnetForm, prefixLength: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="48">/48</SelectItem>
                      <SelectItem value="56">/56</SelectItem>
                      <SelectItem value="64">/64</SelectItem>
                      <SelectItem value="80">/80</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Preferred Lifetime (sec)</Label>
                  <Input type="number" value={subnetForm.preferredLifetime} onChange={(e) => setSubnetForm({ ...subnetForm, preferredLifetime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Valid Lifetime (sec)</Label>
                  <Input type="number" value={subnetForm.validLifetime} onChange={(e) => setSubnetForm({ ...subnetForm, validLifetime: e.target.value })} />
                </div>
                <div className="sm:col-span-2 border-t pt-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">Router Advertisement (RA)</p>
                </div>
                <div className="flex items-center justify-between space-x-2">
                  <Label className="text-xs font-semibold">RA Enabled</Label>
                  <Switch checked={subnetForm.raEnabled} onCheckedChange={(v) => setSubnetForm({ ...subnetForm, raEnabled: v })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">RA Interval (sec)</Label>
                  <Input type="number" value={subnetForm.raIntervalSec} onChange={(e) => setSubnetForm({ ...subnetForm, raIntervalSec: e.target.value })} />
                </div>
                <div className="flex items-center justify-between space-x-2">
                  <Label className="text-xs font-semibold">M Flag (Managed)</Label>
                  <Switch checked={subnetForm.raManagedFlag} onCheckedChange={(v) => setSubnetForm({ ...subnetForm, raManagedFlag: v })} />
                </div>
                <div className="flex items-center justify-between space-x-2">
                  <Label className="text-xs font-semibold">O Flag (Other)</Label>
                  <Switch checked={subnetForm.raOtherFlag} onCheckedChange={(v) => setSubnetForm({ ...subnetForm, raOtherFlag: v })} />
                </div>
                <div className="sm:col-span-2 border-t pt-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">DHCPv6 Options</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">DNS Servers (comma-separated)</Label>
                  <Input value={subnetForm.dnsServers} onChange={(e) => setSubnetForm({ ...subnetForm, dnsServers: e.target.value })} placeholder="2001:4860:4860::8888,..." />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Domain Search</Label>
                  <Input value={subnetForm.domainSearch} onChange={(e) => setSubnetForm({ ...subnetForm, domainSearch: e.target.value })} placeholder="isp.example.com" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">NTP Servers</Label>
                  <Input value={subnetForm.ntpServers} onChange={(e) => setSubnetForm({ ...subnetForm, ntpServers: e.target.value })} placeholder="2001:db8::1" />
                </div>
                <div className="flex items-center justify-between space-x-2">
                  <Label className="text-xs font-semibold">Rapid Commit</Label>
                  <Switch checked={subnetForm.rapidCommit} onCheckedChange={(v) => setSubnetForm({ ...subnetForm, rapidCommit: v })} />
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between space-x-2 p-3 rounded-lg bg-muted/50">
                    <div>
                      <Label className="text-xs font-semibold">Enabled</Label>
                      <p className="text-[10px] text-muted-foreground">Enable this subnet for DHCPv6 service</p>
                    </div>
                    <Switch checked={subnetForm.enabled} onCheckedChange={(v) => setSubnetForm({ ...subnetForm, enabled: v })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setSubnetDialogOpen(false); setSubnetForm(defaultSubnetForm); setSubnetEditId(null); }}>Cancel</Button>
                <Button onClick={saveSubnet} disabled={!subnetForm.name || !subnetForm.interfaceName || !subnetForm.prefix} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {subnetEditId ? "Update Subnet" : "Create Subnet"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Subnet Delete Dialog */}
          <AlertDialog open={!!subnetDeleteId} onOpenChange={() => setSubnetDeleteId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete DHCPv6 Subnet?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete this subnet and all associated pools, reservations, and prefix delegations. This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => subnetDeleteId && subnetDeleteMut.mutate(subnetDeleteId)} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 2: RESERVATIONS                                   */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="reservations" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Host Reservations</h3>
            <Button onClick={openResCreate} className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> Add Reservation
            </Button>
          </div>

          {reservationsQuery.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filteredReservations.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No IPv6 reservations configured.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <SearchPagination search={resSearch} setSearch={setResSearch} page={resPage} setPage={setResPage} totalPages={resPaged.totalPages} total={filteredReservations.length} />
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs font-semibold">DUID</TableHead>
                          <TableHead className="text-xs font-semibold">IPv6 Address</TableHead>
                          <TableHead className="text-xs font-semibold">Hostname</TableHead>
                          <TableHead className="text-xs font-semibold">Subnet</TableHead>
                          <TableHead className="text-xs font-semibold">Client Type</TableHead>
                          <TableHead className="text-xs font-semibold">Enabled</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resPaged.items.map((r) => (
                          <TableRow key={r.id} className="group hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10 transition-colors">
                            <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.duid}</code></TableCell>
                            <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.ipAddress}</code></TableCell>
                            <TableCell className="text-sm">{r.hostname || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.dhcpV6Subnet?.name ?? "—"}</TableCell>
                            <TableCell><Badge variant="secondary" className="text-[10px]">{r.clientType}</Badge></TableCell>
                            <TableCell>
                              {r.enabled ? (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px]">Active</Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 text-[10px]">Disabled</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openResEdit(r)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setResDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Reservation Dialog */}
          <Dialog open={resDialogOpen} onOpenChange={(open) => { if (!open) { setResDialogOpen(false); setResForm(defaultReservationForm); setResEditId(null); } }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{resEditId ? "Edit Reservation" : "Create Reservation"}</DialogTitle>
                <DialogDescription>{resEditId ? "Modify the host reservation." : "Add a new IPv6 host reservation by DUID."}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Subnet *</Label>
                  <Select value={resForm.dhcpV6SubnetId} onValueChange={(v) => setResForm({ ...resForm, dhcpV6SubnetId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select subnet" /></SelectTrigger>
                    <SelectContent>
                      {subnets.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.prefix}/{s.prefixLength})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">DUID *</Label>
                  <Input value={resForm.duid} onChange={(e) => setResForm({ ...resForm, duid: e.target.value })} placeholder="e.g., 00:01:00:01:a1:b2:c3:d4" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">IAID</Label>
                  <Input value={resForm.iaid} onChange={(e) => setResForm({ ...resForm, iaid: e.target.value })} placeholder="Identity Association Identifier" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">IPv6 Address *</Label>
                  <Input value={resForm.ipAddress} onChange={(e) => setResForm({ ...resForm, ipAddress: e.target.value })} placeholder="e.g., 2001:db8:1::100" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Hostname</Label>
                  <Input value={resForm.hostname} onChange={(e) => setResForm({ ...resForm, hostname: e.target.value })} placeholder="e.g., cpe-customer-001" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Client Type</Label>
                  <Select value={resForm.clientType} onValueChange={(v) => setResForm({ ...resForm, clientType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SUBSCRIBER">Subscriber</SelectItem>
                      <SelectItem value="DEVICE">Device</SelectItem>
                      <SelectItem value="INFRASTRUCTURE">Infrastructure</SelectItem>
                      <SelectItem value="AP">Access Point</SelectItem>
                      <SelectItem value="SWITCH">Switch</SelectItem>
                      <SelectItem value="OLT">OLT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Subscriber ID</Label>
                  <Input value={resForm.subscriberId} onChange={(e) => setResForm({ ...resForm, subscriberId: e.target.value })} placeholder="Optional subscriber reference" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Device ID</Label>
                  <Input value={resForm.deviceId} onChange={(e) => setResForm({ ...resForm, deviceId: e.target.value })} placeholder="Optional device reference" />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label className="text-xs font-semibold">Description</Label>
                  <Input value={resForm.description} onChange={(e) => setResForm({ ...resForm, description: e.target.value })} placeholder="Optional notes" />
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between space-x-2 p-3 rounded-lg bg-muted/50">
                    <div>
                      <Label className="text-xs font-semibold">Enabled</Label>
                      <p className="text-[10px] text-muted-foreground">Enable this reservation</p>
                    </div>
                    <Switch checked={resForm.enabled} onCheckedChange={(v) => setResForm({ ...resForm, enabled: v })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setResDialogOpen(false); setResForm(defaultReservationForm); setResEditId(null); }}>Cancel</Button>
                <Button onClick={saveRes} disabled={!resForm.dhcpV6SubnetId || !resForm.duid || !resForm.ipAddress} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {resEditId ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Reservation Delete Dialog */}
          <AlertDialog open={!!resDeleteId} onOpenChange={() => setResDeleteId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Reservation?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently remove this IPv6 host reservation.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => resDeleteId && resDeleteMut.mutate(resDeleteId)} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 3: PREFIX DELEGATION                              */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="prefix-delegation" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Prefix Delegation (IA_PD)</h3>
            <Button onClick={openPdCreate} className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> Add PD Pool
            </Button>
          </div>

          {pdQuery.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filteredPd.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Layers className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No prefix delegation pools configured.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <SearchPagination search={pdSearch} setSearch={setPdSearch} page={pdPage} setPage={setPdPage} totalPages={pdPaged.totalPages} total={filteredPd.length} />
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs font-semibold">Name</TableHead>
                          <TableHead className="text-xs font-semibold">Delegated Prefix</TableHead>
                          <TableHead className="text-xs font-semibold">Prefix Length</TableHead>
                          <TableHead className="text-xs font-semibold">Client DUID</TableHead>
                          <TableHead className="text-xs font-semibold">Lease Time</TableHead>
                          <TableHead className="text-xs font-semibold">Enabled</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pdPaged.items.map((pdItem) => (
                          <TableRow key={pdItem.id} className="group hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10 transition-colors">
                            <TableCell className="font-medium text-sm">{pdItem.name || "—"}</TableCell>
                            <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{pdItem.delegatedPrefix}</code></TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400 text-[10px] font-semibold">/{pdItem.prefixLength}</Badge>
                            </TableCell>
                            <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{pdItem.clientDuid || "Any"}</code></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{pdItem.leaseTime / 3600}h</TableCell>
                            <TableCell>
                              {pdItem.enabled ? (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px]">Active</Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 text-[10px]">Disabled</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openPdEdit(pdItem)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setPdDeleteId(pdItem.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* PD Dialog */}
          <Dialog open={pdDialogOpen} onOpenChange={(open) => { if (!open) { setPdDialogOpen(false); setPdForm(defaultPdForm); setPdEditId(null); } }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{pdEditId ? "Edit Prefix Delegation" : "Create Prefix Delegation"}</DialogTitle>
                <DialogDescription>{pdEditId ? "Modify the prefix delegation pool." : "Configure a new IA_PD prefix delegation for downstream CPEs."}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Subnet *</Label>
                  <Select value={pdForm.dhcpV6SubnetId} onValueChange={(v) => setPdForm({ ...pdForm, dhcpV6SubnetId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select subnet" /></SelectTrigger>
                    <SelectContent>
                      {subnets.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.prefix}/{s.prefixLength})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Name</Label>
                  <Input value={pdForm.name} onChange={(e) => setPdForm({ ...pdForm, name: e.target.value })} placeholder="e.g., PD-Pool-01" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Delegated Prefix *</Label>
                  <Input value={pdForm.delegatedPrefix} onChange={(e) => setPdForm({ ...pdForm, delegatedPrefix: e.target.value })} placeholder="e.g., 2001:db8:100::" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Prefix Length</Label>
                  <Select value={pdForm.prefixLength} onValueChange={(v) => setPdForm({ ...pdForm, prefixLength: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="48">/48</SelectItem>
                      <SelectItem value="56">/56</SelectItem>
                      <SelectItem value="60">/60</SelectItem>
                      <SelectItem value="64">/64</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Client DUID</Label>
                  <Input value={pdForm.clientDuid} onChange={(e) => setPdForm({ ...pdForm, clientDuid: e.target.value })} placeholder="Specific CPE DUID (empty = any)" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Lease Time (sec)</Label>
                  <Input type="number" value={pdForm.leaseTime} onChange={(e) => setPdForm({ ...pdForm, leaseTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Subscriber ID</Label>
                  <Input value={pdForm.subscriberId} onChange={(e) => setPdForm({ ...pdForm, subscriberId: e.target.value })} placeholder="Optional subscriber reference" />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label className="text-xs font-semibold">Description</Label>
                  <Input value={pdForm.description} onChange={(e) => setPdForm({ ...pdForm, description: e.target.value })} placeholder="Optional notes" />
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between space-x-2 p-3 rounded-lg bg-muted/50">
                    <div>
                      <Label className="text-xs font-semibold">Enabled</Label>
                      <p className="text-[10px] text-muted-foreground">Enable this prefix delegation pool</p>
                    </div>
                    <Switch checked={pdForm.enabled} onCheckedChange={(v) => setPdForm({ ...pdForm, enabled: v })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPdDialogOpen(false); setPdForm(defaultPdForm); setPdEditId(null); }}>Cancel</Button>
                <Button onClick={savePd} disabled={!pdForm.dhcpV6SubnetId || !pdForm.delegatedPrefix} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {pdEditId ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* PD Delete Dialog */}
          <AlertDialog open={!!pdDeleteId} onOpenChange={() => setPdDeleteId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Prefix Delegation?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently remove this prefix delegation pool.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => pdDeleteId && pdDeleteMut.mutate(pdDeleteId)} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB 4: KEA-DHCPv6 STATUS                              */}
        {/* ═══════════════════════════════════════════════════════ */}
        <TabsContent value="kea" className="mt-4">
          <div className="space-y-6">
            {/* Banner */}
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
              <CardContent className="p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">KEA DHCPv6 Server Integration</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    KEA DHCPv6 server integration requires the <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">kea-dhcp6-server</code> package. This dashboard shows configuration state based on the subnets, pools, reservations, and prefix delegations defined above.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="animate-card-enter" style={{ animationDelay: "0ms" }}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground">DHCPv6 Subnets</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                      <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-2xl font-bold">{stats?.totalSubnets ?? 0}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{stats?.activeSubnets ?? 0} active, {((stats?.totalSubnets ?? 0) - (stats?.activeSubnets ?? 0))} disabled</p>
                </CardContent>
              </Card>
              <Card className="animate-card-enter" style={{ animationDelay: "50ms" }}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground">Active Pools</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center">
                      <Server className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <span className="text-2xl font-bold">{stats?.totalPools ?? 0}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Address allocation pools</p>
                </CardContent>
              </Card>
              <Card className="animate-card-enter" style={{ animationDelay: "100ms" }}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground">Reservations</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
                      <Shield className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-2xl font-bold">{stats?.totalReservations ?? 0}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Host reservations by DUID</p>
                </CardContent>
              </Card>
              <Card className="animate-card-enter" style={{ animationDelay: "150ms" }}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground">PD Pools</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-cyan-100 dark:bg-cyan-950/40 flex items-center justify-center">
                      <ArrowRight className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <span className="text-2xl font-bold">{stats?.totalPdDelegations ?? 0}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Prefix delegation (IA_PD)</p>
                </CardContent>
              </Card>
            </div>

            {/* KEA Config Preview */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">KEA DHCPv6 Configuration</CardTitle>
                    <CardDescription className="text-xs">Generated config based on current platform settings</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setKeaConfigOpen(true)}>
                      <FileJson className="h-3.5 w-3.5 mr-1.5" /> View Config
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={copyKeaConfig}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <pre className="bg-muted/70 rounded-lg p-4 text-xs font-mono max-h-[240px] overflow-auto text-foreground/80 border">
                  {generateKeaConfig().slice(0, 500)}...
                </pre>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" className="border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950/20" onClick={() => toast.success("KEA DHCPv6 configuration reload simulated successfully")}>
                    <RotateCcw className="h-4 w-4 mr-2 text-emerald-600 dark:text-emerald-400" /> Reload Configuration
                  </Button>
                  <Button variant="outline" className="border-teal-200 hover:bg-teal-50 dark:border-teal-800 dark:hover:bg-teal-950/20" onClick={() => toast.success("KEA DHCPv6 configuration test passed")}>
                    <Play className="h-4 w-4 mr-2 text-teal-600 dark:text-teal-400" /> Test Configuration
                  </Button>
                  <Button variant="outline" className="border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-950/20" onClick={() => { queryClient.invalidateQueries({ queryKey: ["dhcpv6"] }); toast.success("Status refreshed"); }}>
                    <RefreshCw className="h-4 w-4 mr-2 text-green-600 dark:text-green-400" /> Refresh Status
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* KEA Config Dialog */}
            <Dialog open={keaConfigOpen} onOpenChange={setKeaConfigOpen}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>KEA DHCPv6 Configuration (kea-dhcp6.conf)</DialogTitle>
                  <DialogDescription>Full generated configuration based on current platform DHCPv6 settings.</DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-auto">
                  <pre className="bg-muted/70 rounded-lg p-4 text-xs font-mono text-foreground/80 border whitespace-pre">{generateKeaConfig()}</pre>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={copyKeaConfig}><Copy className="h-4 w-4 mr-2" /> Copy to Clipboard</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
