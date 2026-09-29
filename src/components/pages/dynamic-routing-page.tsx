"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Route, Globe, Network, Layers, Activity, Plus, Trash2, Edit,
  RefreshCw, Power, PowerOff, Shield, Server, Loader2, Search, X, Eye,
  Hexagon, Radio, AlertTriangle, ListFilter, FileText, Lock,
  ChevronRight, RotateCcw, PlayCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────
interface BgpNeighbor {
  ip: string;
  as: string;
  state: string;
  uptime: string;
  prefixRx: number;
  prefixTx: number;
}

interface BgpConfig {
  enabled: boolean;
  localAs: string;
  routerId: string;
  neighbors: BgpNeighbor[];
  networks: Array<{ prefix: string }>;
  summary: { routesReceived: number; routesAccepted: number };
}

interface OspfArea {
  id: string;
  interfaces: string[];
  neighborCount: number;
}

interface OspfInterface {
  name: string;
  area: string;
  state: string;
  cost: number;
  hello: number;
  dead: number;
}

interface OspfConfig {
  enabled: boolean;
  routerId: string;
  areas: OspfArea[];
  interfaces: OspfInterface[];
}

interface Ospf6Area {
  id: string;
  interfaces: string[];
}

interface Ospf6Interface {
  name: string;
  area: string;
  state: string;
}

interface Ospf6Config {
  enabled: boolean;
  routerId: string;
  areas: Ospf6Area[];
  interfaces: Ospf6Interface[];
}

interface RipConfig {
  enabled: boolean;
  networks: string[];
  interfaces: Array<{ name: string; state: string }>;
}

interface RipngConfig {
  enabled: boolean;
  interfaces: string[];
  routes: number;
  metric: number;
}

interface BfdPeer {
  neighbor: string;
  interface: string;
  state: string;
  rxInterval: number;
  txInterval: number;
}

interface BfdConfig {
  enabled: boolean;
  peers: BfdPeer[];
}

interface IsisArea {
  tag: string;
  level: string;
  interfaces: string[];
}

interface IsisNeighbor {
  systemId: string;
  interface: string;
  state: string;
  level: string;
  holdTime: number;
}

interface IsisConfig {
  enabled: boolean;
  net: string;
  areas: IsisArea[];
  neighbors: IsisNeighbor[];
}

interface RouteEntry {
  type: string;
  prefix: string;
  nextHop: string;
  interface: string;
  metric: number;
  age: string;
}

interface RouteMapEntry {
  name: string;
  action: string;
  sequence: number;
  matchRules: string[];
  setRules: string[];
}

interface PrefixListEntry {
  name: string;
  seq: number;
  action: string;
  prefix: string;
  le?: number;
  ge?: number;
}

interface AccessListEntry {
  name: string;
  type: string;
  rules: Array<{
    seq: number;
    action: string;
    source: string;
    destination?: string;
    protocol?: string;
  }>;
}

interface DynamicRoutingResponse {
  frrInstalled: boolean;
  frrDaemonsRunning: boolean;
  frrVersion: string;
  vtyshPath: string;
  frrPortable: boolean;
  overview: { runningDaemons: string[]; routerId: string; hostname: string };
  bgp: BgpConfig;
  ospf: OspfConfig;
  ospf6: Ospf6Config;
  rip: RipConfig;
  ripng: RipngConfig;
  bfd: BfdConfig;
  isis: IsisConfig;
  routeTable: RouteEntry[];
  routeMaps: RouteMapEntry[];
  prefixLists: PrefixListEntry[];
  accessLists: AccessListEntry[];
  runningConfig: string;
}

// ─── Helpers ──────────────────────────────────────────────────────
function StateBadge({ state }: { state: string }) {
  const isUp = ["Established", "Full", "Up", "UP", "Running", "RUNNING", "PointToPoint", "DR", "BDR", "2-Way", "Init", "Exchange", "Loading"].includes(state);
  const isWarn = ["Active", "Connect", "OpenSent", "OpenConfirm"].includes(state);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
      isUp
        ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
        : isWarn
          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isUp ? "bg-green-500" : isWarn ? "bg-amber-500" : "bg-red-500"} ${!isUp ? "animate-pulse" : ""}`} />
      {state}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    B: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
    O: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
    C: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-400",
    S: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    R: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
    K: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  };
  const cls = colorMap[type] || colorMap["K"];
  return <Badge className={`${cls} border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold`}>{type}</Badge>;
}

function DaemonStatusBadge({ daemon, running }: { daemon: string; running: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="font-mono text-sm">{daemon}</span>
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        running
          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
          : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
      }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-green-500" : "bg-red-500"} ${!running ? "animate-pulse" : ""}`} />
        {running ? "Running" : "Stopped"}
      </span>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const isPermit = action.toLowerCase() === "permit";
  return (
    <Badge className={`border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
      isPermit
        ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
        : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
    }`}>
      {action}
    </Badge>
  );
}

const ALL_DAEMONS = ["bgpd", "ospfd", "ospf6d", "ripd", "bfdd", "isisd", "zebra", "staticd"];

// ─── Component ────────────────────────────────────────────────────
export default function DynamicRoutingPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [routeSearch, setRouteSearch] = useState("");

  // ─── Dialog States ───
  // BGP
  const [bgpConfigOpen, setBgpConfigOpen] = useState(false);
  const [bgpConfigForm, setBgpConfigForm] = useState({ localAs: "", routerId: "", networks: "" });
  const [bgpNeighborOpen, setBgpNeighborOpen] = useState(false);
  const [bgpNeighborForm, setBgpNeighborForm] = useState({ ip: "", remoteAs: "", description: "" });
  const [deleteBgpNeighborOpen, setDeleteBgpNeighborOpen] = useState(false);
  const [deleteBgpNeighborTarget, setDeleteBgpNeighborTarget] = useState<string | null>(null);

  // OSPF
  const [ospfConfigOpen, setOspfConfigOpen] = useState(false);
  const [ospfConfigForm, setOspfConfigForm] = useState({ routerId: "", areas: "" });
  const [ospfAreaEntry, setOspfAreaEntry] = useState({ id: "", networks: "" });

  // OSPFv3
  const [ospf6ConfigOpen, setOspf6ConfigOpen] = useState(false);
  const [ospf6ConfigForm, setOspf6ConfigForm] = useState({ routerId: "", areas: "" });
  const [ospf6AreaEntry, setOspf6AreaEntry] = useState({ id: "", networks: "" });

  // RIP
  const [ripNetworkOpen, setRipNetworkOpen] = useState(false);
  const [ripNetworkForm, setRipNetworkForm] = useState({ network: "" });
  const [deleteRipNetworkOpen, setDeleteRipNetworkOpen] = useState(false);
  const [deleteRipNetworkTarget, setDeleteRipNetworkTarget] = useState<string | null>(null);

  // RIPng
  const [ripngInterfaceOpen, setRipngInterfaceOpen] = useState(false);
  const [ripngInterfaceForm, setRipngInterfaceForm] = useState({ interface: "" });
  const [deleteRipngInterfaceOpen, setDeleteRipngInterfaceOpen] = useState(false);
  const [deleteRipngInterfaceTarget, setDeleteRipngInterfaceTarget] = useState<string | null>(null);

  // BFD
  const [bfdPeerOpen, setBfdPeerOpen] = useState(false);
  const [bfdPeerForm, setBfdPeerForm] = useState({ neighbor: "", interface: "", rxInterval: "300", txInterval: "300" });
  const [deleteBfdPeerOpen, setDeleteBfdPeerOpen] = useState(false);
  const [deleteBfdPeerTarget, setDeleteBfdPeerTarget] = useState<string | null>(null);

  // ISIS
  const [isisConfigOpen, setIsisConfigOpen] = useState(false);
  const [isisConfigForm, setIsisConfigForm] = useState({ net: "", areas: "" });
  const [isisAreaEntry, setIsisAreaEntry] = useState({ tag: "", level: "level-2", interfaces: "" });

  // Route Maps
  const [routeMapOpen, setRouteMapOpen] = useState(false);
  const [routeMapForm, setRouteMapForm] = useState({ name: "", action: "permit", sequence: "10", matchClauses: "", setClauses: "" });
  const [deleteRouteMapOpen, setDeleteRouteMapOpen] = useState(false);
  const [deleteRouteMapTarget, setDeleteRouteMapTarget] = useState<string | null>(null);

  // Prefix Lists
  const [prefixListOpen, setPrefixListOpen] = useState(false);
  const [prefixListForm, setPrefixListForm] = useState({ name: "", seq: "10", action: "permit", prefix: "", le: "", ge: "" });
  const [deletePrefixListOpen, setDeletePrefixListOpen] = useState(false);
  const [deletePrefixListTarget, setDeletePrefixListTarget] = useState<string | null>(null);

  // ACLs
  const [aclOpen, setAclOpen] = useState(false);
  const [aclForm, setAclForm] = useState({ name: "", action: "permit", source: "", destination: "", protocol: "" });
  const [deleteAclOpen, setDeleteAclOpen] = useState(false);
  const [deleteAclTarget, setDeleteAclTarget] = useState<string | null>(null);

  // ─── Data Fetching ───
  const { data, isLoading, isFetching } = useQuery<DynamicRoutingResponse>({
    queryKey: ["dynamic-routing"],
    queryFn: () => apiFetch<DynamicRoutingResponse>("/api/dynamic-routing"),
    refetchInterval: 30000,
  });

  const frrInstalled = data?.frrInstalled ?? false;
  const frrDaemonsRunning = data?.frrDaemonsRunning ?? false;
  const frrVersion = data?.frrVersion ?? "";
  const frrPortable = data?.frrPortable ?? false;
  const overview = data?.overview ?? { runningDaemons: [], routerId: "", hostname: "" };
  const bgp = data?.bgp ?? { enabled: false, localAs: "", routerId: "", neighbors: [], networks: [], summary: { routesReceived: 0, routesAccepted: 0 } };
  const ospf = data?.ospf ?? { enabled: false, routerId: "", areas: [], interfaces: [] };
  const ospf6 = data?.ospf6 ?? { enabled: false, routerId: "", areas: [], interfaces: [] };
  const rip = data?.rip ?? { enabled: false, networks: [], interfaces: [] };
  const ripng = data?.ripng ?? { enabled: false, interfaces: [], routes: 0, metric: 2 };
  const bfd = data?.bfd ?? { enabled: false, peers: [] };
  const isis = data?.isis ?? { enabled: false, net: "", areas: [], neighbors: [] };
  const routeTable = data?.routeTable ?? [];
  const routeMaps = data?.routeMaps ?? [];
  const prefixLists = data?.prefixLists ?? [];
  const accessLists = data?.accessLists ?? [];
  const runningConfig = data?.runningConfig ?? "";

  // ─── Mutations ───
  const usePostMutation = (action: string, successMsg: string) =>
    useMutation({
      mutationFn: (payload: Record<string, unknown>) =>
        apiFetch("/api/dynamic-routing", {
          method: "POST",
          body: JSON.stringify({ action, ...payload }),
        }),
      onSuccess: () => {
        toast.success(successMsg);
        queryClient.invalidateQueries({ queryKey: ["dynamic-routing"] });
      },
      onError: (err) => toast.error(`${action.replace(/-/g, " ")} failed: ${String(err)}`),
    });

  const useDeleteMutation = (action: string, successMsg: string) =>
    useMutation({
      mutationFn: (payload?: Record<string, unknown>) =>
        apiFetch("/api/dynamic-routing", {
          method: "DELETE",
          body: JSON.stringify({ action, ...payload }),
        }),
      onSuccess: () => {
        toast.success(successMsg);
        queryClient.invalidateQueries({ queryKey: ["dynamic-routing"] });
      },
      onError: (err) => toast.error(`${action.replace(/-/g, " ")} failed: ${String(err)}`),
    });

  const configureBgpMutation = usePostMutation("configure-bgp", "BGP configuration saved");
  const addBgpNeighborMutation = usePostMutation("add-bgp-neighbor", "BGP neighbor added");
  const removeBgpNeighborMutation = useDeleteMutation("remove-bgp-neighbor", "BGP neighbor removed");
  const disableBgpMutation = useDeleteMutation("disable-bgp", "BGP disabled");

  const configureOspfMutation = usePostMutation("configure-ospf", "OSPFv2 configuration saved");
  const disableOspfMutation = useDeleteMutation("disable-ospf", "OSPFv2 disabled");

  const configureOspf6Mutation = usePostMutation("configure-ospf6", "OSPFv3 configuration saved");
  const disableOspf6Mutation = useDeleteMutation("disable-ospf6", "OSPFv3 disabled");

  const enableRipMutation = usePostMutation("configure-rip", "RIP network added");
  const removeRipNetworkMutation = useDeleteMutation("remove-rip-network", "RIP network removed");
  const disableRipMutation = useDeleteMutation("disable-rip", "RIP disabled");

  const configureRipngMutation = usePostMutation("configure-ripng", "RIPng configured");
  const removeRipngInterfaceMutation = useDeleteMutation("remove-ripng-interface", "RIPng interface removed");
  const disableRipngMutation = useDeleteMutation("disable-ripng", "RIPng disabled");

  const addBfdPeerMutation = usePostMutation("add-bfd-peer", "BFD peer added");
  const removeBfdPeerMutation = useDeleteMutation("remove-bfd-peer", "BFD peer removed");
  const enableBfdMutation = usePostMutation("enable-bfd", "BFD enabled");
  const disableBfdMutation = useDeleteMutation("disable-bfd", "BFD disabled");

  const configureIsisMutation = usePostMutation("configure-isis", "ISIS configuration saved");
  const disableIsisMutation = useDeleteMutation("disable-isis", "ISIS disabled");

  // New mutations for Route Maps, Prefix Lists, ACLs, and FRR Service
  const addRouteMapMutation = usePostMutation("add-route-map", "Route map added");
  const removeRouteMapMutation = useDeleteMutation("remove-route-map", "Route map removed");
  const addPrefixListMutation = usePostMutation("add-prefix-list", "Prefix list added");
  const removePrefixListMutation = useDeleteMutation("remove-prefix-list", "Prefix list removed");
  const addAclMutation = usePostMutation("add-access-list", "ACL rule added");
  const removeAclMutation = useDeleteMutation("remove-access-list", "ACL removed");

  const frrServiceMutation = useMutation({
    mutationFn: (operation: string) =>
      apiFetch("/api/dynamic-routing", {
        method: "POST",
        body: JSON.stringify({ action: "service-frr", operation }),
      }),
    onSuccess: () => {
      toast.success(`FRR service operation completed`);
      queryClient.invalidateQueries({ queryKey: ["dynamic-routing"] });
    },
    onError: (err) => toast.error(`FRR service operation failed: ${String(err)}`),
  });

  // ─── Handlers ───
  function openBgpConfig() {
    setBgpConfigForm({
      localAs: bgp.localAs || "",
      routerId: bgp.routerId || overview.routerId || "",
      networks: (bgp.networks || []).map((n) => (typeof n === "string" ? n : n.prefix)).join("\n"),
    });
    setBgpConfigOpen(true);
  }

  function saveBgpConfig() {
    const networks = bgpConfigForm.networks
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    configureBgpMutation.mutate({
      localAs: bgpConfigForm.localAs,
      routerId: bgpConfigForm.routerId,
      networks,
    });
    setBgpConfigOpen(false);
  }

  function openBgpNeighborDialog() {
    setBgpNeighborForm({ ip: "", remoteAs: "", description: "" });
    setBgpNeighborOpen(true);
  }

  function addBgpNeighbor() {
    addBgpNeighborMutation.mutate({
      ip: bgpNeighborForm.ip,
      remoteAs: bgpNeighborForm.remoteAs,
      description: bgpNeighborForm.description,
    });
    setBgpNeighborOpen(false);
  }

  function confirmDeleteBgpNeighbor(ip: string) {
    setDeleteBgpNeighborTarget(ip);
    setDeleteBgpNeighborOpen(true);
  }

  function executeDeleteBgpNeighbor() {
    if (deleteBgpNeighborTarget) {
      removeBgpNeighborMutation.mutate({ ip: deleteBgpNeighborTarget });
      setDeleteBgpNeighborOpen(false);
      setDeleteBgpNeighborTarget(null);
    }
  }

  function toggleBgp() {
    if (bgp.enabled) {
      disableBgpMutation.mutate({});
    } else {
      configureBgpMutation.mutate({
        localAs: bgp.localAs || bgpConfigForm.localAs,
        routerId: bgp.routerId || bgpConfigForm.routerId || overview.routerId,
        networks: bgp.networks || [],
      });
    }
  }

  // OSPF handlers
  function openOspfConfig() {
    setOspfConfigForm({
      routerId: ospf.routerId || overview.routerId || "",
      areas: (ospf.areas || [])
        .map((a) => `${a.id}:${(a.interfaces || []).join(",")}`)
        .join("\n"),
    });
    setOspfAreaEntry({ id: "", networks: "" });
    setOspfConfigOpen(true);
  }

  function saveOspfConfig() {
    const areaLines = ospfConfigForm.areas.split("\n").filter(Boolean);
    const areas = areaLines.map((line) => {
      const [id, rest] = line.split(":");
      return { id: id?.trim() || "", interfaces: (rest || "").split(",").map((s) => s.trim()).filter(Boolean) };
    });
    configureOspfMutation.mutate({ routerId: ospfConfigForm.routerId, areas });
    setOspfConfigOpen(false);
  }

  function toggleOspf() {
    if (ospf.enabled) {
      disableOspfMutation.mutate({});
    } else {
      configureOspfMutation.mutate({
        routerId: ospf.routerId || overview.routerId,
        areas: ospf.areas || [],
      });
    }
  }

  // OSPFv3 handlers
  function openOspf6Config() {
    setOspf6ConfigForm({
      routerId: ospf6.routerId || overview.routerId || "",
      areas: (ospf6.areas || [])
        .map((a) => `${a.id}:${(a.interfaces || []).join(",")}`)
        .join("\n"),
    });
    setOspf6AreaEntry({ id: "", networks: "" });
    setOspf6ConfigOpen(true);
  }

  function saveOspf6Config() {
    const areaLines = ospf6ConfigForm.areas.split("\n").filter(Boolean);
    const areas = areaLines.map((line) => {
      const [id, rest] = line.split(":");
      return { id: id?.trim() || "", interfaces: (rest || "").split(",").map((s) => s.trim()).filter(Boolean) };
    });
    configureOspf6Mutation.mutate({ routerId: ospf6ConfigForm.routerId, areas });
    setOspf6ConfigOpen(false);
  }

  function toggleOspf6() {
    if (ospf6.enabled) {
      disableOspf6Mutation.mutate({});
    } else {
      configureOspf6Mutation.mutate({
        routerId: ospf6.routerId || overview.routerId,
        areas: ospf6.areas || [],
      });
    }
  }

  // RIP handlers
  function openRipNetworkDialog() {
    setRipNetworkForm({ network: "" });
    setRipNetworkOpen(true);
  }

  function addRipNetwork() {
    enableRipMutation.mutate({ networks: [...rip.networks, ripNetworkForm.network] });
    setRipNetworkOpen(false);
  }

  function confirmDeleteRipNetwork(network: string) {
    setDeleteRipNetworkTarget(network);
    setDeleteRipNetworkOpen(true);
  }

  function executeDeleteRipNetwork() {
    if (deleteRipNetworkTarget) {
      removeRipNetworkMutation.mutate({ network: deleteRipNetworkTarget });
      setDeleteRipNetworkOpen(false);
      setDeleteRipNetworkTarget(null);
    }
  }

  function toggleRip() {
    if (rip.enabled) {
      disableRipMutation.mutate({});
    } else {
      enableRipMutation.mutate({ networks: rip.networks });
    }
  }

  // RIPng handlers
  function openRipngInterfaceDialog() {
    setRipngInterfaceForm({ interface: "" });
    setRipngInterfaceOpen(true);
  }

  function addRipngInterface() {
    configureRipngMutation.mutate({ interfaces: [...ripng.interfaces, ripngInterfaceForm.interface] });
    setRipngInterfaceOpen(false);
  }

  function confirmDeleteRipngInterface(iface: string) {
    setDeleteRipngInterfaceTarget(iface);
    setDeleteRipngInterfaceOpen(true);
  }

  function executeDeleteRipngInterface() {
    if (deleteRipngInterfaceTarget) {
      removeRipngInterfaceMutation.mutate({ interface: deleteRipngInterfaceTarget });
      setDeleteRipngInterfaceOpen(false);
      setDeleteRipngInterfaceTarget(null);
    }
  }

  function toggleRipng() {
    if (ripng.enabled) {
      disableRipngMutation.mutate({});
    } else {
      configureRipngMutation.mutate({ interfaces: ripng.interfaces });
    }
  }

  // BFD handlers
  function openBfdPeerDialog() {
    setBfdPeerForm({ neighbor: "", interface: "", rxInterval: "300", txInterval: "300" });
    setBfdPeerOpen(true);
  }

  function addBfdPeer() {
    addBfdPeerMutation.mutate({
      neighbor: bfdPeerForm.neighbor,
      interface: bfdPeerForm.interface,
      rxInterval: Number(bfdPeerForm.rxInterval),
      txInterval: Number(bfdPeerForm.txInterval),
    });
    setBfdPeerOpen(false);
  }

  function confirmDeleteBfdPeer(neighbor: string) {
    setDeleteBfdPeerTarget(neighbor);
    setDeleteBfdPeerOpen(true);
  }

  function executeDeleteBfdPeer() {
    if (deleteBfdPeerTarget) {
      removeBfdPeerMutation.mutate({ neighbor: deleteBfdPeerTarget });
      setDeleteBfdPeerOpen(false);
      setDeleteBfdPeerTarget(null);
    }
  }

  function toggleBfd() {
    if (bfd.enabled) {
      disableBfdMutation.mutate({});
    } else {
      enableBfdMutation.mutate({});
    }
  }

  // ISIS handlers
  function openIsisConfig() {
    setIsisConfigForm({
      net: isis.net || "",
      areas: (isis.areas || [])
        .map((a) => `${a.tag}:${a.level}:${(a.interfaces || []).join(",")}`)
        .join("\n"),
    });
    setIsisAreaEntry({ tag: "", level: "level-2", interfaces: "" });
    setIsisConfigOpen(true);
  }

  function saveIsisConfig() {
    const areaLines = isisConfigForm.areas.split("\n").filter(Boolean);
    const areas = areaLines.map((line) => {
      const parts = line.split(":");
      return {
        tag: parts[0]?.trim() || "",
        level: parts[1]?.trim() || "level-2",
        interfaces: (parts[2] || "").split(",").map((s) => s.trim()).filter(Boolean),
      };
    });
    configureIsisMutation.mutate({ net: isisConfigForm.net, areas });
    setIsisConfigOpen(false);
  }

  function toggleIsis() {
    if (isis.enabled) {
      disableIsisMutation.mutate({});
    } else {
      configureIsisMutation.mutate({ net: isis.net || "49.0001.0000.0000.0001.00", areas: isis.areas || [] });
    }
  }

  // Route Maps handlers
  function openRouteMapDialog() {
    setRouteMapForm({ name: "", action: "permit", sequence: "10", matchClauses: "", setClauses: "" });
    setRouteMapOpen(true);
  }

  function addRouteMap() {
    const matchClauses = routeMapForm.matchClauses.split("\n").map((s) => s.trim()).filter(Boolean);
    const setClauses = routeMapForm.setClauses.split("\n").map((s) => s.trim()).filter(Boolean);
    addRouteMapMutation.mutate({
      name: routeMapForm.name,
      action: routeMapForm.action,
      sequence: Number(routeMapForm.sequence),
      matchClauses,
      setClauses,
    });
    setRouteMapOpen(false);
  }

  function confirmDeleteRouteMap(name: string) {
    setDeleteRouteMapTarget(name);
    setDeleteRouteMapOpen(true);
  }

  function executeDeleteRouteMap() {
    if (deleteRouteMapTarget) {
      removeRouteMapMutation.mutate({ name: deleteRouteMapTarget });
      setDeleteRouteMapOpen(false);
      setDeleteRouteMapTarget(null);
    }
  }

  // Prefix Lists handlers
  function openPrefixListDialog() {
    setPrefixListForm({ name: "", seq: "10", action: "permit", prefix: "", le: "", ge: "" });
    setPrefixListOpen(true);
  }

  function addPrefixList() {
    addPrefixListMutation.mutate({
      name: prefixListForm.name,
      seq: Number(prefixListForm.seq),
      action: prefixListForm.action,
      prefix: prefixListForm.prefix,
      le: prefixListForm.le ? Number(prefixListForm.le) : undefined,
      ge: prefixListForm.ge ? Number(prefixListForm.ge) : undefined,
    });
    setPrefixListOpen(false);
  }

  function confirmDeletePrefixList(name: string) {
    setDeletePrefixListTarget(name);
    setDeletePrefixListOpen(true);
  }

  function executeDeletePrefixList() {
    if (deletePrefixListTarget) {
      removePrefixListMutation.mutate({ name: deletePrefixListTarget });
      setDeletePrefixListOpen(false);
      setDeletePrefixListTarget(null);
    }
  }

  // ACLs handlers
  function openAclDialog() {
    setAclForm({ name: "", action: "permit", source: "", destination: "", protocol: "" });
    setAclOpen(true);
  }

  function addAcl() {
    addAclMutation.mutate({
      name: aclForm.name,
      action: aclForm.action,
      source: aclForm.source,
      destination: aclForm.destination || undefined,
      protocol: aclForm.protocol || undefined,
    });
    setAclOpen(false);
  }

  function confirmDeleteAcl(name: string) {
    setDeleteAclTarget(name);
    setDeleteAclOpen(true);
  }

  function executeDeleteAcl() {
    if (deleteAclTarget) {
      removeAclMutation.mutate({ name: deleteAclTarget });
      setDeleteAclOpen(false);
      setDeleteAclTarget(null);
    }
  }

  // FRR Service handler
  function handleFrrService(operation: string) {
    frrServiceMutation.mutate(operation);
  }

  // Route table filter
  const filteredRoutes = routeTable.filter(
    (r) =>
      !routeSearch ||
      r.prefix.toLowerCase().includes(routeSearch.toLowerCase()) ||
      r.nextHop.toLowerCase().includes(routeSearch.toLowerCase()) ||
      r.interface.toLowerCase().includes(routeSearch.toLowerCase()) ||
      r.type.toLowerCase().includes(routeSearch.toLowerCase())
  );

  const routeTypeCounts = routeTable.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {});

  // ─── Loading ───
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="skeleton-wave h-20 rounded-lg" />
        <Skeleton className="skeleton-wave h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">Dynamic Routing</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                frrInstalled && frrDaemonsRunning
                  ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                  : frrInstalled
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                    : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
              }`}>
                <span className={`h-2 w-2 rounded-full ${frrInstalled && frrDaemonsRunning ? "bg-green-500" : "bg-red-500"} ${!frrDaemonsRunning ? "animate-pulse" : ""}`} />
                {frrInstalled && frrDaemonsRunning ? "FRR Connected" : frrInstalled ? "FRR Stopped" : "FRR Not Found"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage FRRouting protocols — BGP, OSPF, OSPFv3, RIP, RIPng, BFD, ISIS, route maps, prefix lists, ACLs, and running config.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["dynamic-routing"] })}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">
            <Eye className="h-4 w-4 mr-1.5 hidden sm:inline" />Overview
          </TabsTrigger>
          <TabsTrigger value="bgp">
            <Globe className="h-4 w-4 mr-1.5 hidden sm:inline" />BGP
          </TabsTrigger>
          <TabsTrigger value="ospf">
            <Network className="h-4 w-4 mr-1.5 hidden sm:inline" />OSPFv2
          </TabsTrigger>
          <TabsTrigger value="ospf6">
            <Layers className="h-4 w-4 mr-1.5 hidden sm:inline" />OSPFv3
          </TabsTrigger>
          <TabsTrigger value="rip">
            <Radio className="h-4 w-4 mr-1.5 hidden sm:inline" />RIP
          </TabsTrigger>
          <TabsTrigger value="ripng">
            <Radio className="h-4 w-4 mr-1.5 hidden sm:inline" />RIPng
          </TabsTrigger>
          <TabsTrigger value="bfd">
            <Activity className="h-4 w-4 mr-1.5 hidden sm:inline" />BFD
          </TabsTrigger>
          <TabsTrigger value="isis">
            <Hexagon className="h-4 w-4 mr-1.5 hidden sm:inline" />ISIS
          </TabsTrigger>
          <TabsTrigger value="routes">
            <Route className="h-4 w-4 mr-1.5 hidden sm:inline" />Route Table
          </TabsTrigger>
          <TabsTrigger value="routemaps">
            <ChevronRight className="h-4 w-4 mr-1.5 hidden sm:inline" />Route Maps
          </TabsTrigger>
          <TabsTrigger value="prefixlists">
            <ListFilter className="h-4 w-4 mr-1.5 hidden sm:inline" />Prefix Lists
          </TabsTrigger>
          <TabsTrigger value="acls">
            <Lock className="h-4 w-4 mr-1.5 hidden sm:inline" />ACLs
          </TabsTrigger>
          <TabsTrigger value="config">
            <FileText className="h-4 w-4 mr-1.5 hidden sm:inline" />Config
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════ TAB 1: Overview ═══════════════════ */}
        <TabsContent value="overview">
          {!frrInstalled ? (
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-950/40">
                    <AlertTriangle className="h-6 w-6 text-amber-600" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">FRRouting Not Installed</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        FRRouting (FRR) is required for dynamic routing capabilities. Install it to enable BGP, OSPF, RIP, and other routing protocols.
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Installation Instructions</p>
                      <pre className="text-xs font-mono text-foreground bg-background rounded-md p-3 overflow-x-auto">
{`# Debian/Ubuntu
apt update && apt install -y frr frr-pythontools

# Enable FRR
sed -i 's/FRR_DEFAULTS=no/FRR_DEFAULTS=yes/' /etc/default/frr

# Configure daemons in /etc/frr/daemons
# Enable the protocols you need (bgpd=yes, ospfd=yes, etc.)

# Start FRR
systemctl enable frr
systemctl restart frr`}
                      </pre>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Server className="h-3.5 w-3.5" />
                      <span>vtysh path expected: <code className="font-mono bg-muted px-1.5 py-0.5 rounded">/usr/bin/vtysh</code></span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* FRR Daemon Status Banner */}
              <Card className={`border-border/50 shadow-sm rounded-xl ${!frrDaemonsRunning ? "border-amber-300 dark:border-amber-700" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${frrDaemonsRunning ? "bg-green-100 dark:bg-green-950/40" : "bg-red-100 dark:bg-red-950/40"}`}>
                        {frrDaemonsRunning ? (
                          <PlayCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <div>
                        <h3 className={`text-sm font-semibold ${frrDaemonsRunning ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                          {frrDaemonsRunning ? "FRR Daemons Running \u2713" : "FRR Daemons Not Running"}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {frrDaemonsRunning
                            ? "All FRRouting daemon processes are active and operational."
                            : "FRR daemon processes are not running. Start the service to enable routing."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-green-600 hover:bg-green-700 text-white border-green-600 hover:border-green-700"
                        onClick={() => handleFrrService("start")}
                        disabled={frrServiceMutation.isPending || frrDaemonsRunning}
                      >
                        {frrServiceMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1.5" />}
                        Start
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-amber-600 hover:bg-amber-700 text-white border-amber-600 hover:border-amber-700"
                        onClick={() => handleFrrService("stop")}
                        disabled={frrServiceMutation.isPending || !frrDaemonsRunning}
                      >
                        {frrServiceMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PowerOff className="h-4 w-4 mr-1.5" />}
                        Stop
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleFrrService("restart")}
                        disabled={frrServiceMutation.isPending}
                      >
                        {frrServiceMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
                        Restart
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-0 rounded-xl bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/20 ring-1 ring-slate-200/60 hover:scale-[1.02] transition-all duration-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800/60 dark:to-slate-700/40 shadow-sm shadow-slate-500/25">
                        <Shield className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold tabular-nums">{frrVersion || "\u2014"}</p>
                        <p className="text-xs text-muted-foreground">FRR Version</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 ring-1 ring-green-200/60 hover:scale-[1.02] transition-all duration-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-gradient-to-br from-green-200 to-green-300 dark:from-green-800/60 dark:to-green-700/40 shadow-sm shadow-green-500/25">
                        <Server className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold tabular-nums text-green-600">{overview.runningDaemons.length}</p>
                        <p className="text-xs text-muted-foreground">Running Daemons</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20 ring-1 ring-amber-200/60 hover:scale-[1.02] transition-all duration-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-gradient-to-br from-amber-200 to-amber-300 dark:from-amber-800/60 dark:to-amber-700/40 shadow-sm shadow-amber-500/25">
                        <Route className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold tabular-nums text-amber-600">{routeTable.length}</p>
                        <p className="text-xs text-muted-foreground">Total Routes</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 rounded-xl bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-950/30 dark:to-red-950/20 ring-1 ring-rose-200/60 hover:scale-[1.02] transition-all duration-200">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-gradient-to-br from-rose-200 to-rose-300 dark:from-rose-800/60 dark:to-rose-700/40 shadow-sm shadow-rose-500/25">
                        <Globe className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold tabular-nums text-rose-600">{bgp.neighbors.length}</p>
                        <p className="text-xs text-muted-foreground">BGP Neighbors</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Router Info */}
              <Card className="border-border/50 shadow-sm rounded-xl">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-sm">
                      <Server className="h-3.5 w-3.5" />
                    </div>
                    <CardTitle className="text-base">Router Information</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Hostname</p>
                      <p className="font-mono text-sm font-medium">{overview.hostname || "\u2014"}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Router ID</p>
                      <p className="font-mono text-sm font-medium">{overview.routerId || "\u2014"}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">vtysh Path</p>
                      <p className="font-mono text-sm font-medium">{data?.vtyshPath || "\u2014"}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Install Type</p>
                      <Badge variant="outline" className="text-xs font-mono">
                        {frrPortable ? "Portable" : "System Install"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Running Daemons */}
              <Card className="border-border/50 shadow-sm rounded-xl">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-green-400 to-green-500 text-white shadow-sm">
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                    <CardTitle className="text-base">Running Daemons</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {ALL_DAEMONS.map((daemon) => (
                      <DaemonStatusBadge
                        key={daemon}
                        daemon={daemon}
                        running={overview.runningDaemons.includes(daemon)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════ TAB 2: BGP ═══════════════════ */}
        <TabsContent value="bgp">
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 text-white shadow-sm">
                      <Globe className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">BGP Configuration</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Border Gateway Protocol \u2014 External routing</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={bgp.enabled ? "destructive" : "default"}
                      className={!bgp.enabled ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                      onClick={toggleBgp}
                      disabled={configureBgpMutation.isPending || disableBgpMutation.isPending}
                    >
                      {(configureBgpMutation.isPending || disableBgpMutation.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      {bgp.enabled ? <PowerOff className="h-4 w-4 mr-1.5" /> : <Power className="h-4 w-4 mr-1.5" />}
                      {bgp.enabled ? "Disable BGP" : "Enable BGP"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={openBgpConfig}>
                      <Edit className="h-4 w-4 mr-1.5" />Configure BGP
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Parameter</TableHead>
                        <TableHead className="text-xs">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Status</TableCell>
                        <TableCell>
                          <StateBadge state={bgp.enabled ? "Running" : "Down"} />
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Local AS</TableCell>
                        <TableCell className="font-mono text-sm">{bgp.localAs || "\u2014"}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Router ID</TableCell>
                        <TableCell className="font-mono text-sm">{bgp.routerId || "\u2014"}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Routes Received</TableCell>
                        <TableCell className="font-mono text-sm text-green-600">{bgp.summary.routesReceived}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Routes Accepted</TableCell>
                        <TableCell className="font-mono text-sm text-amber-600">{bgp.summary.routesAccepted}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Networks</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(bgp.networks || []).map((net) => {
                              const prefix = typeof net === "string" ? net : net.prefix;
                              return <Badge key={prefix} variant="outline" className="text-[10px] font-mono">{prefix}</Badge>;
                            })}
                            {(!bgp.networks || bgp.networks.length === 0) && <span className="text-xs text-muted-foreground">None</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* BGP Neighbors */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-400 to-rose-500 text-white shadow-sm">
                      <Network className="h-3.5 w-3.5" />
                    </div>
                    <CardTitle className="text-base">BGP Neighbors</CardTitle>
                  </div>
                  <Button size="sm" className="bg-destructive hover:bg-destructive/90 text-white" onClick={openBgpNeighborDialog}>
                    <Plus className="h-4 w-4 mr-1.5" />Add Neighbor
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Neighbor IP</TableHead>
                        <TableHead className="text-xs">Remote AS</TableHead>
                        <TableHead className="text-xs">State</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Uptime</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Prefixes Rx</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Prefixes Tx</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bgp.neighbors.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12">
                            <Globe className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No BGP neighbors configured</p>
                            <p className="text-xs text-muted-foreground mt-1">Click &quot;Add Neighbor&quot; to establish a BGP session</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        bgp.neighbors.map((neighbor) => (
                          <TableRow key={neighbor.ip} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{neighbor.ip}</TableCell>
                            <TableCell className="font-mono text-xs">{neighbor.as}</TableCell>
                            <TableCell>
                              <StateBadge state={neighbor.state} />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{neighbor.uptime || "\u2014"}</TableCell>
                            <TableCell className="font-mono text-xs hidden lg:table-cell">{neighbor.prefixRx}</TableCell>
                            <TableCell className="font-mono text-xs hidden lg:table-cell">{neighbor.prefixTx}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                onClick={() => confirmDeleteBgpNeighbor(neighbor.ip)}
                                title="Remove Neighbor"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 3: OSPFv2 ═══════════════════ */}
        <TabsContent value="ospf">
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-green-400 to-green-500 text-white shadow-sm">
                      <Network className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">OSPFv2 Configuration</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Open Shortest Path First \u2014 IPv4 Interior routing</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={ospf.enabled ? "destructive" : "default"}
                      className={!ospf.enabled ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                      onClick={toggleOspf}
                      disabled={configureOspfMutation.isPending || disableOspfMutation.isPending}
                    >
                      {(configureOspfMutation.isPending || disableOspfMutation.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      {ospf.enabled ? <PowerOff className="h-4 w-4 mr-1.5" /> : <Power className="h-4 w-4 mr-1.5" />}
                      {ospf.enabled ? "Disable OSPF" : "Enable OSPF"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={openOspfConfig}>
                      <Edit className="h-4 w-4 mr-1.5" />Configure OSPF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Parameter</TableHead>
                        <TableHead className="text-xs">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Status</TableCell>
                        <TableCell><StateBadge state={ospf.enabled ? "Running" : "Down"} /></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Router ID</TableCell>
                        <TableCell className="font-mono text-sm">{ospf.routerId || "\u2014"}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* OSPF Areas */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-green-400 to-green-500 text-white shadow-sm">
                    <Layers className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">OSPF Areas</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Area ID</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Interfaces</TableHead>
                        <TableHead className="text-xs">Neighbors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ospf.areas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-12">
                            <Layers className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No OSPF areas configured</p>
                            <p className="text-xs text-muted-foreground mt-1">Configure OSPF to define areas</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        ospf.areas.map((area) => (
                          <TableRow key={area.id} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{area.id}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {(area.interfaces || []).map((iface) => (
                                  <Badge key={iface} variant="outline" className="text-[10px] font-mono">{iface}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{area.neighborCount}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* OSPF Interfaces */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-green-400 to-green-500 text-white shadow-sm">
                    <Activity className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">OSPF Interfaces</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Area</TableHead>
                        <TableHead className="text-xs">State</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Cost</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Hello</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Dead</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ospf.interfaces.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12">
                            <Activity className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No OSPF interfaces</p>
                            <p className="text-xs text-muted-foreground mt-1">Interfaces will appear when OSPF is enabled</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        ospf.interfaces.map((iface) => (
                          <TableRow key={iface.name} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{iface.name}</TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">{iface.area}</TableCell>
                            <TableCell><StateBadge state={iface.state} /></TableCell>
                            <TableCell className="font-mono text-xs hidden lg:table-cell">{iface.cost}</TableCell>
                            <TableCell className="font-mono text-xs hidden lg:table-cell">{iface.hello}s</TableCell>
                            <TableCell className="font-mono text-xs hidden xl:table-cell">{iface.dead}s</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 4: OSPFv3 ═══════════════════ */}
        <TabsContent value="ospf6">
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-400 to-teal-500 text-white shadow-sm">
                      <Layers className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">OSPFv3 Configuration</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Open Shortest Path First \u2014 IPv6 Interior routing</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={ospf6.enabled ? "destructive" : "default"}
                      className={!ospf6.enabled ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                      onClick={toggleOspf6}
                      disabled={configureOspf6Mutation.isPending || disableOspf6Mutation.isPending}
                    >
                      {(configureOspf6Mutation.isPending || disableOspf6Mutation.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      {ospf6.enabled ? <PowerOff className="h-4 w-4 mr-1.5" /> : <Power className="h-4 w-4 mr-1.5" />}
                      {ospf6.enabled ? "Disable OSPFv3" : "Enable OSPFv3"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={openOspf6Config}>
                      <Edit className="h-4 w-4 mr-1.5" />Configure OSPFv3
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Parameter</TableHead>
                        <TableHead className="text-xs">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Status</TableCell>
                        <TableCell><StateBadge state={ospf6.enabled ? "Running" : "Down"} /></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Router ID</TableCell>
                        <TableCell className="font-mono text-sm">{ospf6.routerId || "\u2014"}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* OSPFv3 Areas */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-400 to-teal-500 text-white shadow-sm">
                    <Layers className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">OSPFv3 Areas</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Area ID</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Interfaces</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ospf6.areas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center py-12">
                            <Layers className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No OSPFv3 areas configured</p>
                            <p className="text-xs text-muted-foreground mt-1">Configure OSPFv3 to define areas</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        ospf6.areas.map((area) => (
                          <TableRow key={area.id} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{area.id}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {(area.interfaces || []).map((iface) => (
                                  <Badge key={iface} variant="outline" className="text-[10px] font-mono">{iface}</Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* OSPFv3 Interfaces */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-400 to-teal-500 text-white shadow-sm">
                    <Activity className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">OSPFv3 Interfaces</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Area</TableHead>
                        <TableHead className="text-xs">State</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ospf6.interfaces.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-12">
                            <Activity className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No OSPFv3 interfaces</p>
                            <p className="text-xs text-muted-foreground mt-1">Interfaces will appear when OSPFv3 is enabled</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        ospf6.interfaces.map((iface) => (
                          <TableRow key={iface.name} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{iface.name}</TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">{iface.area}</TableCell>
                            <TableCell><StateBadge state={iface.state} /></TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 5: RIP ═══════════════════ */}
        <TabsContent value="rip">
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm">
                      <Radio className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">RIP Configuration</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Routing Information Protocol \u2014 Distance vector routing</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={rip.enabled ? "destructive" : "default"}
                      className={!rip.enabled ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                      onClick={toggleRip}
                      disabled={enableRipMutation.isPending || disableRipMutation.isPending}
                    >
                      {(enableRipMutation.isPending || disableRipMutation.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      {rip.enabled ? <PowerOff className="h-4 w-4 mr-1.5" /> : <Power className="h-4 w-4 mr-1.5" />}
                      {rip.enabled ? "Disable RIP" : "Enable RIP"}
                    </Button>
                    <Button size="sm" className="bg-destructive hover:bg-destructive/90 text-white" onClick={openRipNetworkDialog}>
                      <Plus className="h-4 w-4 mr-1.5" />Add Network
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Advertised Networks</p>
                    {rip.networks.length === 0 ? (
                      <div className="text-center py-6 bg-muted/30 rounded-lg">
                        <Radio className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No networks advertised via RIP</p>
                        <p className="text-xs text-muted-foreground mt-1">Click &quot;Add Network&quot; to advertise a network</p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {rip.networks.map((network) => (
                          <div key={network} className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-xs font-mono py-1 px-3">
                              {network}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                              onClick={() => confirmDeleteRipNetwork(network)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* RIP Interfaces */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm">
                    <Activity className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">RIP Interfaces</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Interface</TableHead>
                        <TableHead className="text-xs">State</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rip.interfaces.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center py-12">
                            <Activity className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No RIP interfaces active</p>
                            <p className="text-xs text-muted-foreground mt-1">Interfaces will appear when RIP is enabled</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        rip.interfaces.map((iface) => (
                          <TableRow key={iface.name} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{iface.name}</TableCell>
                            <TableCell><StateBadge state={iface.state} /></TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 6: RIPng ═══════════════════ */}
        <TabsContent value="ripng">
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-400 to-purple-500 text-white shadow-sm">
                      <Radio className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">RIPng (IPv6)</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">RIP Next Generation \u2014 IPv6 routing</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={ripng.enabled ? "destructive" : "default"}
                      className={!ripng.enabled ? "bg-purple-600 hover:bg-purple-700 text-white" : ""}
                      onClick={toggleRipng}
                      disabled={configureRipngMutation.isPending || disableRipngMutation.isPending}
                    >
                      {(configureRipngMutation.isPending || disableRipngMutation.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      {ripng.enabled ? <PowerOff className="h-4 w-4 mr-1.5" /> : <Power className="h-4 w-4 mr-1.5" />}
                      {ripng.enabled ? "Disable RIPng" : "Enable RIPng"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={openRipngInterfaceDialog}>
                      <Plus className="h-4 w-4 mr-1.5" />Add Interface
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Parameter</TableHead>
                        <TableHead className="text-xs">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Status</TableCell>
                        <TableCell><StateBadge state={ripng.enabled ? "Running" : "Down"} /></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Interfaces</TableCell>
                        <TableCell className="font-mono text-sm">{ripng.interfaces.length}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Routes</TableCell>
                        <TableCell className="font-mono text-sm text-purple-600">{ripng.routes}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Metric</TableCell>
                        <TableCell className="font-mono text-sm">{ripng.metric}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* RIPng Interfaces */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-purple-400 to-purple-500 text-white shadow-sm">
                    <Network className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">RIPng Interfaces</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {ripng.interfaces.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Interface</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ripng.interfaces.map((iface) => (
                          <TableRow key={iface}>
                            <TableCell className="font-mono text-sm">{iface}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => confirmDeleteRipngInterface(iface)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-4">
                    <div className="rounded-full bg-muted p-3 mb-3">
                      <Network className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No RIPng interfaces configured</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={openRipngInterfaceDialog}>
                      <Plus className="h-4 w-4 mr-1.5" />Add Interface
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 7: BFD ═══════════════════ */}
        <TabsContent value="bfd">
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-sm">
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">BFD Configuration</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Bidirectional Forwarding Detection \u2014 Fast failure detection</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={bfd.enabled ? "destructive" : "default"}
                      className={!bfd.enabled ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                      onClick={toggleBfd}
                      disabled={enableBfdMutation.isPending || disableBfdMutation.isPending}
                    >
                      {(enableBfdMutation.isPending || disableBfdMutation.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      {bfd.enabled ? <PowerOff className="h-4 w-4 mr-1.5" /> : <Power className="h-4 w-4 mr-1.5" />}
                      {bfd.enabled ? "Disable BFD" : "Enable BFD"}
                    </Button>
                    <Button size="sm" className="bg-destructive hover:bg-destructive/90 text-white" onClick={openBfdPeerDialog}>
                      <Plus className="h-4 w-4 mr-1.5" />Add Peer
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Neighbor</TableHead>
                        <TableHead className="text-xs">Interface</TableHead>
                        <TableHead className="text-xs">State</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">RX Interval</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">TX Interval</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bfd.peers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12">
                            <Activity className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No BFD peers configured</p>
                            <p className="text-xs text-muted-foreground mt-1">Click &quot;Add Peer&quot; to configure BFD monitoring</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        bfd.peers.map((peer) => (
                          <TableRow key={peer.neighbor + peer.interface} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{peer.neighbor}</TableCell>
                            <TableCell className="font-mono text-xs">{peer.interface}</TableCell>
                            <TableCell><StateBadge state={peer.state} /></TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">{peer.rxInterval}ms</TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">{peer.txInterval}ms</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                onClick={() => confirmDeleteBfdPeer(peer.neighbor)}
                                title="Remove Peer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 7: ISIS ═══════════════════ */}
        <TabsContent value="isis">
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-400 to-violet-500 text-white shadow-sm">
                      <Hexagon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">ISIS Configuration</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Intermediate System to Intermediate System \u2014 Link-state routing</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={isis.enabled ? "destructive" : "default"}
                      className={!isis.enabled ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                      onClick={toggleIsis}
                      disabled={configureIsisMutation.isPending || disableIsisMutation.isPending}
                    >
                      {(configureIsisMutation.isPending || disableIsisMutation.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      {isis.enabled ? <PowerOff className="h-4 w-4 mr-1.5" /> : <Power className="h-4 w-4 mr-1.5" />}
                      {isis.enabled ? "Disable ISIS" : "Enable ISIS"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={openIsisConfig}>
                      <Edit className="h-4 w-4 mr-1.5" />Configure ISIS
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Parameter</TableHead>
                        <TableHead className="text-xs">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Status</TableCell>
                        <TableCell><StateBadge state={isis.enabled ? "Running" : "Down"} /></TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">NET</TableCell>
                        <TableCell className="font-mono text-sm">{isis.net || "\u2014"}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* ISIS Areas */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-400 to-violet-500 text-white shadow-sm">
                    <Layers className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">ISIS Areas</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Area Tag</TableHead>
                        <TableHead className="text-xs">Level</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Interfaces</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isis.areas.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-12">
                            <Layers className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No ISIS areas configured</p>
                            <p className="text-xs text-muted-foreground mt-1">Configure ISIS to define areas</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        isis.areas.map((area) => (
                          <TableRow key={area.tag + area.level} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{area.tag}</TableCell>
                            <TableCell>
                              <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400 border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                                {area.level}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {(area.interfaces || []).map((iface) => (
                                  <Badge key={iface} variant="outline" className="text-[10px] font-mono">{iface}</Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* ISIS Neighbors */}
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-400 to-violet-500 text-white shadow-sm">
                    <Network className="h-3.5 w-3.5" />
                  </div>
                  <CardTitle className="text-base">ISIS Neighbors</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">System ID</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Interface</TableHead>
                        <TableHead className="text-xs">State</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Level</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Hold Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isis.neighbors.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12">
                            <Network className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No ISIS neighbors discovered</p>
                            <p className="text-xs text-muted-foreground mt-1">Neighbors will appear when ISIS adjacencies form</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        isis.neighbors.map((neighbor) => (
                          <TableRow key={neighbor.systemId + neighbor.interface} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{neighbor.systemId}</TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">{neighbor.interface}</TableCell>
                            <TableCell><StateBadge state={neighbor.state} /></TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400 border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                                {neighbor.level}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs hidden xl:table-cell">{neighbor.holdTime}s</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 8: Route Table ═══════════════════ */}
        <TabsContent value="routes">
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              <Card className="border-0 rounded-xl bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/20 ring-1 ring-slate-200/60">
                <CardContent className="p-3 text-center">
                  <p className="text-xl font-bold tabular-nums">{routeTable.length}</p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </CardContent>
              </Card>
              {["B", "O", "C", "S", "R"].map((type) => (
                <Card key={type} className="border-0 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 ring-1 ring-border/50">
                  <CardContent className="p-3 text-center">
                    <p className="text-xl font-bold tabular-nums">{routeTypeCounts[type] || 0}</p>
                    <p className="text-[10px] text-muted-foreground">{type === "B" ? "BGP" : type === "O" ? "OSPF" : type === "C" ? "Connected" : type === "S" ? "Static" : type === "R" ? "RIP" : type}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-sm">
                      <Route className="h-3.5 w-3.5" />
                    </div>
                    <CardTitle className="text-base">FRR Routing Table</CardTitle>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Filter routes..."
                      value={routeSearch}
                      onChange={(e) => setRouteSearch(e.target.value)}
                      className="pl-9 h-9"
                    />
                    {routeSearch && (
                      <button onClick={() => setRouteSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 bg-background z-10">
                        <TableHead className="text-xs w-16">Type</TableHead>
                        <TableHead className="text-xs">Prefix</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Next Hop</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Interface</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Metric</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Age</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRoutes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12">
                            <Route className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">{routeSearch ? "No routes match your filter" : "No routes in the FRR routing table"}</p>
                            <p className="text-xs text-muted-foreground mt-1">{routeSearch ? "Try a different search term" : "Routes will appear when routing protocols are active"}</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRoutes.map((route, index) => (
                          <TableRow key={index} className="hover:bg-muted/50 transition-colors">
                            <TableCell><TypeBadge type={route.type} /></TableCell>
                            <TableCell className="font-mono text-xs font-medium">{route.prefix}</TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">{route.nextHop || "\u2014"}</TableCell>
                            <TableCell className="font-mono text-xs hidden lg:table-cell">{route.interface || "\u2014"}</TableCell>
                            <TableCell className="font-mono text-xs hidden xl:table-cell">{route.metric}</TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{route.age || "\u2014"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
              {filteredRoutes.length > 0 && (
                <div className="px-4 py-3 border-t border-border/50 text-xs text-muted-foreground">
                  Showing {filteredRoutes.length} of {routeTable.length} routes
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 9: Route Maps ═══════════════════ */}
        <TabsContent value="routemaps">
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-500 text-white shadow-sm">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Route Maps</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Define routing policy with match and set rules</p>
                    </div>
                  </div>
                  <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white" onClick={openRouteMapDialog}>
                    <Plus className="h-4 w-4 mr-1.5" />Add Route Map
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 bg-background z-10">
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Action</TableHead>
                        <TableHead className="text-xs">Sequence</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Match Rules</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Set Rules</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routeMaps.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12">
                            <ChevronRight className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No route maps configured</p>
                            <p className="text-xs text-muted-foreground mt-1">Click &quot;Add Route Map&quot; to create routing policies</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        routeMaps.map((rm, index) => (
                          <TableRow key={`${rm.name}-${rm.sequence}-${index}`} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{rm.name}</TableCell>
                            <TableCell><ActionBadge action={rm.action} /></TableCell>
                            <TableCell className="font-mono text-xs">{rm.sequence}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {(rm.matchRules || []).map((rule, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px] font-mono">{rule}</Badge>
                                ))}
                                {(!rm.matchRules || rm.matchRules.length === 0) && <span className="text-xs text-muted-foreground">None</span>}
                              </div>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {(rm.setRules || []).map((rule, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px] font-mono">{rule}</Badge>
                                ))}
                                {(!rm.setRules || rm.setRules.length === 0) && <span className="text-xs text-muted-foreground">None</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                onClick={() => confirmDeleteRouteMap(rm.name)}
                                title="Remove Route Map"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 10: Prefix Lists ═══════════════════ */}
        <TabsContent value="prefixlists">
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-sm">
                      <ListFilter className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Prefix Lists</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Filter network prefixes for route policies</p>
                    </div>
                  </div>
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={openPrefixListDialog}>
                    <Plus className="h-4 w-4 mr-1.5" />Add Prefix List
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 bg-background z-10">
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Seq</TableHead>
                        <TableHead className="text-xs">Action</TableHead>
                        <TableHead className="text-xs">Prefix</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">LE</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">GE</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prefixLists.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12">
                            <ListFilter className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-muted-foreground">No prefix lists configured</p>
                            <p className="text-xs text-muted-foreground mt-1">Click &quot;Add Prefix List&quot; to create prefix filters</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        prefixLists.map((pl, index) => (
                          <TableRow key={`${pl.name}-${pl.seq}-${index}`} className="hover:bg-muted/50 transition-colors">
                            <TableCell className="font-mono text-sm font-medium">{pl.name}</TableCell>
                            <TableCell className="font-mono text-xs">{pl.seq}</TableCell>
                            <TableCell><ActionBadge action={pl.action} /></TableCell>
                            <TableCell className="font-mono text-xs font-medium">{pl.prefix || "\u2014"}</TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">{pl.le || "\u2014"}</TableCell>
                            <TableCell className="font-mono text-xs hidden md:table-cell">{pl.ge || "\u2014"}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                onClick={() => confirmDeletePrefixList(pl.name)}
                                title="Remove Prefix List"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 11: ACLs ═══════════════════ */}
        <TabsContent value="acls">
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-red-500 text-white shadow-sm">
                      <Lock className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Access Control Lists</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Control traffic flow with standard and extended ACLs</p>
                    </div>
                  </div>
                  <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={openAclDialog}>
                    <Plus className="h-4 w-4 mr-1.5" />Add ACL Rule
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {accessLists.length === 0 ? (
                  <div className="text-center py-12 bg-muted/30 rounded-lg">
                    <Lock className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm font-medium text-muted-foreground">No access lists configured</p>
                    <p className="text-xs text-muted-foreground mt-1">Click &quot;Add ACL Rule&quot; to create access control rules</p>
                  </div>
                ) : (
                  <Accordion type="multiple" className="w-full">
                    {accessLists.map((acl) => (
                      <AccordionItem key={acl.name} value={acl.name}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-medium">{acl.name}</span>
                            <Badge className={`border-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              acl.type === "standard"
                                ? "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-400"
                                : "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400"
                            }`}>
                              {acl.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{(acl.rules || []).length} rule{(acl.rules || []).length !== 1 ? "s" : ""}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="flex justify-end mb-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 h-8 text-xs"
                              onClick={() => confirmDeleteAcl(acl.name)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Remove ACL
                            </Button>
                          </div>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Seq</TableHead>
                                  <TableHead className="text-xs">Action</TableHead>
                                  <TableHead className="text-xs">Source</TableHead>
                                  <TableHead className="text-xs hidden md:table-cell">Destination</TableHead>
                                  <TableHead className="text-xs hidden md:table-cell">Protocol</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(acl.rules || []).map((rule) => (
                                  <TableRow key={rule.seq} className="hover:bg-muted/50 transition-colors">
                                    <TableCell className="font-mono text-xs">{rule.seq}</TableCell>
                                    <TableCell><ActionBadge action={rule.action} /></TableCell>
                                    <TableCell className="font-mono text-xs">{rule.source || "\u2014"}</TableCell>
                                    <TableCell className="font-mono text-xs hidden md:table-cell">{rule.destination || "\u2014"}</TableCell>
                                    <TableCell className="font-mono text-xs hidden md:table-cell">{rule.protocol || "\u2014"}</TableCell>
                                  </TableRow>
                                ))}
                                {(!acl.rules || acl.rules.length === 0) && (
                                  <TableRow>
                                    <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">No rules defined</TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════════ TAB 12: Running Config ═══════════════════ */}
        <TabsContent value="config">
          <div className="space-y-6">
            <Card className="border-border/50 shadow-sm rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-sm">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Running Configuration</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Full FRR running-config output from vtysh</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (runningConfig) {
                          try {
                            await navigator.clipboard.writeText(runningConfig);
                            toast.success("Configuration copied to clipboard");
                          } catch {
                            toast.error("Failed to copy to clipboard");
                          }
                        }
                      }}
                      disabled={!runningConfig}
                    >
                      <Eye className="h-4 w-4 mr-1.5" />
                      Copy to Clipboard
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => queryClient.invalidateQueries({ queryKey: ["dynamic-routing"] })}
                      disabled={isFetching}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {runningConfig ? (
                  <div className="relative">
                    <pre className="bg-muted/50 border border-border/50 rounded-lg p-4 text-xs font-mono text-foreground overflow-x-auto max-h-[70vh] overflow-y-auto whitespace-pre leading-relaxed">
                      {runningConfig}
                    </pre>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-4">
                    <div className="rounded-full bg-muted p-3 mb-3">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {!frrDaemonsRunning ? "FRR daemons are not running. Start FRR to view the running configuration." : "No running configuration available."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════ DIALOGS ═══════════════════ */}

      {/* BGP Configure Dialog */}
      <Dialog open={bgpConfigOpen} onOpenChange={setBgpConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure BGP</DialogTitle>
            <DialogDescription>Set local AS number, router ID, and advertised networks.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bgp-local-as">Local AS Number</Label>
              <Input
                id="bgp-local-as"
                type="number"
                placeholder="e.g. 65001"
                value={bgpConfigForm.localAs}
                onChange={(e) => setBgpConfigForm({ ...bgpConfigForm, localAs: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bgp-router-id">Router ID</Label>
              <Input
                id="bgp-router-id"
                placeholder="e.g. 1.2.3.4"
                value={bgpConfigForm.routerId}
                onChange={(e) => setBgpConfigForm({ ...bgpConfigForm, routerId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bgp-networks">Networks (one CIDR per line)</Label>
              <Textarea
                id="bgp-networks"
                placeholder={"10.0.0.0/8\n192.168.0.0/16"}
                value={bgpConfigForm.networks}
                onChange={(e) => setBgpConfigForm({ ...bgpConfigForm, networks: e.target.value })}
                className="font-mono text-xs min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBgpConfigOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={saveBgpConfig}
              disabled={configureBgpMutation.isPending || !bgpConfigForm.localAs}
            >
              {configureBgpMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BGP Add Neighbor Dialog */}
      <Dialog open={bgpNeighborOpen} onOpenChange={setBgpNeighborOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add BGP Neighbor</DialogTitle>
            <DialogDescription>Establish a new BGP peering session.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bgp-nbr-ip">Neighbor IP Address</Label>
              <Input
                id="bgp-nbr-ip"
                placeholder="e.g. 203.0.113.2"
                value={bgpNeighborForm.ip}
                onChange={(e) => setBgpNeighborForm({ ...bgpNeighborForm, ip: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bgp-nbr-as">Remote AS Number</Label>
              <Input
                id="bgp-nbr-as"
                type="number"
                placeholder="e.g. 65002"
                value={bgpNeighborForm.remoteAs}
                onChange={(e) => setBgpNeighborForm({ ...bgpNeighborForm, remoteAs: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bgp-nbr-desc">Description (optional)</Label>
              <Input
                id="bgp-nbr-desc"
                placeholder="e.g. Transit Provider"
                value={bgpNeighborForm.description}
                onChange={(e) => setBgpNeighborForm({ ...bgpNeighborForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBgpNeighborOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={addBgpNeighbor}
              disabled={addBgpNeighborMutation.isPending || !bgpNeighborForm.ip || !bgpNeighborForm.remoteAs}
            >
              {addBgpNeighborMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Add Neighbor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete BGP Neighbor Dialog */}
      <Dialog open={deleteBgpNeighborOpen} onOpenChange={setDeleteBgpNeighborOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove BGP Neighbor</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove BGP neighbor <code className="font-mono bg-muted px-1 rounded">{deleteBgpNeighborTarget}</code>? This will tear down the BGP session.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBgpNeighborOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={executeDeleteBgpNeighbor}
              disabled={removeBgpNeighborMutation.isPending}
            >
              {removeBgpNeighborMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OSPF Configure Dialog */}
      <Dialog open={ospfConfigOpen} onOpenChange={setOspfConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure OSPFv2</DialogTitle>
            <DialogDescription>Set router ID and define OSPF areas with their interfaces.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ospf-router-id">Router ID</Label>
              <Input
                id="ospf-router-id"
                placeholder="e.g. 1.2.3.4"
                value={ospfConfigForm.routerId}
                onChange={(e) => setOspfConfigForm({ ...ospfConfigForm, routerId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ospf-areas">Areas (format: area_id:iface1,iface2 \u2014 one per line)</Label>
              <Textarea
                id="ospf-areas"
                placeholder={"0.0.0.0:eth0,eth1\n0.0.0.1:eth2"}
                value={ospfConfigForm.areas}
                onChange={(e) => setOspfConfigForm({ ...ospfConfigForm, areas: e.target.value })}
                className="font-mono text-xs min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOspfConfigOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={saveOspfConfig}
              disabled={configureOspfMutation.isPending}
            >
              {configureOspfMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OSPFv3 Configure Dialog */}
      <Dialog open={ospf6ConfigOpen} onOpenChange={setOspf6ConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure OSPFv3</DialogTitle>
            <DialogDescription>Set router ID and define OSPFv3 areas with their interfaces.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ospf6-router-id">Router ID</Label>
              <Input
                id="ospf6-router-id"
                placeholder="e.g. 1.2.3.4"
                value={ospf6ConfigForm.routerId}
                onChange={(e) => setOspf6ConfigForm({ ...ospf6ConfigForm, routerId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ospf6-areas">Areas (format: area_id:iface1,iface2 \u2014 one per line)</Label>
              <Textarea
                id="ospf6-areas"
                placeholder={"0.0.0.0:eth0,eth1\n0.0.0.1:eth2"}
                value={ospf6ConfigForm.areas}
                onChange={(e) => setOspf6ConfigForm({ ...ospf6ConfigForm, areas: e.target.value })}
                className="font-mono text-xs min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOspf6ConfigOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={saveOspf6Config}
              disabled={configureOspf6Mutation.isPending}
            >
              {configureOspf6Mutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RIP Add Network Dialog */}
      <Dialog open={ripNetworkOpen} onOpenChange={setRipNetworkOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add RIP Network</DialogTitle>
            <DialogDescription>Advertise a network via the RIP protocol.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rip-network">Network (CIDR)</Label>
              <Input
                id="rip-network"
                placeholder="e.g. 10.0.0.0/8"
                value={ripNetworkForm.network}
                onChange={(e) => setRipNetworkForm({ ...ripNetworkForm, network: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRipNetworkOpen(false)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={addRipNetwork}
              disabled={enableRipMutation.isPending || !ripNetworkForm.network}
            >
              {enableRipMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Add Network
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete RIP Network Dialog */}
      <Dialog open={deleteRipNetworkOpen} onOpenChange={setDeleteRipNetworkOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove RIP Network</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove network <code className="font-mono bg-muted px-1 rounded">{deleteRipNetworkTarget}</code> from RIP?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRipNetworkOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={executeDeleteRipNetwork}
              disabled={removeRipNetworkMutation.isPending}
            >
              {removeRipNetworkMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RIPng Add Interface Dialog */}
      <Dialog open={ripngInterfaceOpen} onOpenChange={setRipngInterfaceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add RIPng Interface</DialogTitle>
            <DialogDescription>Enable RIPng on a network interface for IPv6 routing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ripng-interface">Interface Name</Label>
              <Input
                id="ripng-interface"
                placeholder="e.g. eth0"
                value={ripngInterfaceForm.interface}
                onChange={(e) => setRipngInterfaceForm({ ...ripngInterfaceForm, interface: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRipngInterfaceOpen(false)}>Cancel</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={addRipngInterface}
              disabled={configureRipngMutation.isPending || !ripngInterfaceForm.interface}
            >
              {configureRipngMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Add Interface
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete RIPng Interface Dialog */}
      <Dialog open={deleteRipngInterfaceOpen} onOpenChange={setDeleteRipngInterfaceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove RIPng Interface</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove interface <code className="font-mono bg-muted px-1 rounded">{deleteRipngInterfaceTarget}</code> from RIPng?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRipngInterfaceOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={executeDeleteRipngInterface}
              disabled={removeRipngInterfaceMutation.isPending}
            >
              {removeRipngInterfaceMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BFD Add Peer Dialog */}
      <Dialog open={bfdPeerOpen} onOpenChange={setBfdPeerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add BFD Peer</DialogTitle>
            <DialogDescription>Configure a BFD peer for fast failure detection.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bfd-neighbor">Neighbor IP Address</Label>
              <Input
                id="bfd-neighbor"
                placeholder="e.g. 10.0.0.2"
                value={bfdPeerForm.neighbor}
                onChange={(e) => setBfdPeerForm({ ...bfdPeerForm, neighbor: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bfd-interface">Interface</Label>
              <Input
                id="bfd-interface"
                placeholder="e.g. eth0"
                value={bfdPeerForm.interface}
                onChange={(e) => setBfdPeerForm({ ...bfdPeerForm, interface: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bfd-rx">RX Interval (ms)</Label>
                <Input
                  id="bfd-rx"
                  type="number"
                  placeholder="300"
                  value={bfdPeerForm.rxInterval}
                  onChange={(e) => setBfdPeerForm({ ...bfdPeerForm, rxInterval: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bfd-tx">TX Interval (ms)</Label>
                <Input
                  id="bfd-tx"
                  type="number"
                  placeholder="300"
                  value={bfdPeerForm.txInterval}
                  onChange={(e) => setBfdPeerForm({ ...bfdPeerForm, txInterval: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBfdPeerOpen(false)}>Cancel</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={addBfdPeer}
              disabled={addBfdPeerMutation.isPending || !bfdPeerForm.neighbor || !bfdPeerForm.interface}
            >
              {addBfdPeerMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Add Peer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete BFD Peer Dialog */}
      <Dialog open={deleteBfdPeerOpen} onOpenChange={setDeleteBfdPeerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove BFD Peer</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove BFD peer <code className="font-mono bg-muted px-1 rounded">{deleteBfdPeerTarget}</code>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBfdPeerOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={executeDeleteBfdPeer}
              disabled={removeBfdPeerMutation.isPending}
            >
              {removeBfdPeerMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ISIS Configure Dialog */}
      <Dialog open={isisConfigOpen} onOpenChange={setIsisConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure ISIS</DialogTitle>
            <DialogDescription>Set NET and define ISIS areas with their interfaces.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="isis-net">Network Entity Title (NET)</Label>
              <Input
                id="isis-net"
                placeholder="e.g. 49.0001.0000.0000.0001.00"
                value={isisConfigForm.net}
                onChange={(e) => setIsisConfigForm({ ...isisConfigForm, net: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="isis-areas">Areas (format: tag:level:iface1,iface2 \u2014 one per line)</Label>
              <Textarea
                id="isis-areas"
                placeholder={"AREA1:level-2:eth0,eth1\nAREA2:level-1:eth2"}
                value={isisConfigForm.areas}
                onChange={(e) => setIsisConfigForm({ ...isisConfigForm, areas: e.target.value })}
                className="font-mono text-xs min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsisConfigOpen(false)}>Cancel</Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={saveIsisConfig}
              disabled={configureIsisMutation.isPending}
            >
              {configureIsisMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Route Map Dialog */}
      <Dialog open={routeMapOpen} onOpenChange={setRouteMapOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Route Map</DialogTitle>
            <DialogDescription>Create a new route map entry with match and set clauses.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rm-name">Name</Label>
                <Input
                  id="rm-name"
                  placeholder="e.g. TO_BGP"
                  value={routeMapForm.name}
                  onChange={(e) => setRouteMapForm({ ...routeMapForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rm-seq">Sequence</Label>
                <Input
                  id="rm-seq"
                  type="number"
                  placeholder="10"
                  value={routeMapForm.sequence}
                  onChange={(e) => setRouteMapForm({ ...routeMapForm, sequence: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-action">Action</Label>
              <Select value={routeMapForm.action} onValueChange={(val) => setRouteMapForm({ ...routeMapForm, action: val })}>
                <SelectTrigger id="rm-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permit">Permit</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-match">Match Clauses (one per line)</Label>
              <Textarea
                id="rm-match"
                placeholder={"ip address prefix-list PL_FROM_OSPF\ncommunity 65001:100"}
                value={routeMapForm.matchClauses}
                onChange={(e) => setRouteMapForm({ ...routeMapForm, matchClauses: e.target.value })}
                className="font-mono text-xs min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-set">Set Clauses (one per line)</Label>
              <Textarea
                id="rm-set"
                placeholder={"local-preference 200\ncommunity additive 65001:200"}
                value={routeMapForm.setClauses}
                onChange={(e) => setRouteMapForm({ ...routeMapForm, setClauses: e.target.value })}
                className="font-mono text-xs min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRouteMapOpen(false)}>Cancel</Button>
            <Button
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
              onClick={addRouteMap}
              disabled={addRouteMapMutation.isPending || !routeMapForm.name}
            >
              {addRouteMapMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Add Route Map
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Route Map Dialog */}
      <Dialog open={deleteRouteMapOpen} onOpenChange={setDeleteRouteMapOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Route Map</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove route map <code className="font-mono bg-muted px-1 rounded">{deleteRouteMapTarget}</code>? This will affect routing policies that reference it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRouteMapOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={executeDeleteRouteMap}
              disabled={removeRouteMapMutation.isPending}
            >
              {removeRouteMapMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Prefix List Dialog */}
      <Dialog open={prefixListOpen} onOpenChange={setPrefixListOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Prefix List</DialogTitle>
            <DialogDescription>Create a new prefix list entry for filtering.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pl-name">Name</Label>
                <Input
                  id="pl-name"
                  placeholder="e.g. PL_FROM_OSPF"
                  value={prefixListForm.name}
                  onChange={(e) => setPrefixListForm({ ...prefixListForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl-seq">Sequence</Label>
                <Input
                  id="pl-seq"
                  type="number"
                  placeholder="10"
                  value={prefixListForm.seq}
                  onChange={(e) => setPrefixListForm({ ...prefixListForm, seq: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pl-action">Action</Label>
              <Select value={prefixListForm.action} onValueChange={(val) => setPrefixListForm({ ...prefixListForm, action: val })}>
                <SelectTrigger id="pl-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permit">Permit</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pl-prefix">Prefix (CIDR)</Label>
              <Input
                id="pl-prefix"
                placeholder="e.g. 10.0.0.0/8"
                value={prefixListForm.prefix}
                onChange={(e) => setPrefixListForm({ ...prefixListForm, prefix: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pl-le">LE (max prefix length, optional)</Label>
                <Input
                  id="pl-le"
                  type="number"
                  placeholder="e.g. 32"
                  value={prefixListForm.le}
                  onChange={(e) => setPrefixListForm({ ...prefixListForm, le: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pl-ge">GE (min prefix length, optional)</Label>
                <Input
                  id="pl-ge"
                  type="number"
                  placeholder="e.g. 24"
                  value={prefixListForm.ge}
                  onChange={(e) => setPrefixListForm({ ...prefixListForm, ge: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrefixListOpen(false)}>Cancel</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={addPrefixList}
              disabled={addPrefixListMutation.isPending || !prefixListForm.name || !prefixListForm.prefix}
            >
              {addPrefixListMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Add Prefix List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Prefix List Dialog */}
      <Dialog open={deletePrefixListOpen} onOpenChange={setDeletePrefixListOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Prefix List</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove prefix list <code className="font-mono bg-muted px-1 rounded">{deletePrefixListTarget}</code>? This may affect route policies.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePrefixListOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={executeDeletePrefixList}
              disabled={removePrefixListMutation.isPending}
            >
              {removePrefixListMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add ACL Dialog */}
      <Dialog open={aclOpen} onOpenChange={setAclOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add ACL Rule</DialogTitle>
            <DialogDescription>Create a new access control list rule.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="acl-name">ACL Name</Label>
              <Input
                id="acl-name"
                placeholder="e.g. ACL_INBOUND"
                value={aclForm.name}
                onChange={(e) => setAclForm({ ...aclForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acl-action">Action</Label>
              <Select value={aclForm.action} onValueChange={(val) => setAclForm({ ...aclForm, action: val })}>
                <SelectTrigger id="acl-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permit">Permit</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="acl-source">Source Address</Label>
              <Input
                id="acl-source"
                placeholder="e.g. 10.0.0.0/8 or any"
                value={aclForm.source}
                onChange={(e) => setAclForm({ ...aclForm, source: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acl-dest">Destination Address (optional, for extended ACLs)</Label>
              <Input
                id="acl-dest"
                placeholder="e.g. 192.168.1.0/24"
                value={aclForm.destination}
                onChange={(e) => setAclForm({ ...aclForm, destination: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acl-proto">Protocol (optional, for extended ACLs)</Label>
              <Input
                id="acl-proto"
                placeholder="e.g. tcp, udp, icmp"
                value={aclForm.protocol}
                onChange={(e) => setAclForm({ ...aclForm, protocol: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAclOpen(false)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={addAcl}
              disabled={addAclMutation.isPending || !aclForm.name || !aclForm.source}
            >
              {addAclMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Add ACL Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete ACL Dialog */}
      <Dialog open={deleteAclOpen} onOpenChange={setDeleteAclOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove ACL</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove access list <code className="font-mono bg-muted px-1 rounded">{deleteAclTarget}</code>? This will affect traffic filtering.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAclOpen(false)}>Cancel</Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={executeDeleteAcl}
              disabled={removeAclMutation.isPending}
            >
              {removeAclMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
