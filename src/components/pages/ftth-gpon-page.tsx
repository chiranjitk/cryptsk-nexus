"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { useModuleStore } from "@/store/module-store";
import {
  Server, Plus, Search, Edit, Trash2, Eye, Radio, Users, Wifi,
  RefreshCw, Download, RotateCcw, ArrowDownToLine as SplitterIcon,
  Loader2, FileText, History, LayoutDashboard, AlertTriangle, X, ChevronDown,
  Info, Activity, Clock, Shield, Cpu, Thermometer, HardDrive, Globe,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Types ────────────────────────────────────────────────────────
interface OltPort {
  id: string;
  portNumber: number;
  portType: string;
  status: string;
  txPower: number | null;
  rxPower: number | null;
  lineProfileId: string;
  serviceProfileId: string;
  subscriber: { id: string; name: string; code: string; ipStackType?: string; ipv6Address?: string } | null;
}

interface OltDevice {
  id: string;
  name: string;
  type: string;
  vendor: string;
  model: string;
  ipAddress: string;
  status: string;
  location: string;
  areaName: string;
  areaId: string | null;
  port: number;
  username: string;
  cpuUsage: number;
  memoryUsage: number;
  temperature: number | null;
  totalPorts: number;
  usedPorts: number;
  freePorts: number;
  utilizationPercent: number;
  ports: OltPort[];
  subscriberCount: number;
  serialNumber: string;
  firmwareVersion: string;
  apiPort: number;
  monitorProtocol: string;
  snmpCommunity: string;
  snmpVersion: string;
  snmpPort: number;
  snmpv3User: string;
  snmpv3AuthProto: string;
  snmpv3PrivProto: string;
  uptimeSeconds: number;
  lastSeenAt: string | null;
  autoBackup: boolean;
  backupSchedule: string;
  configLastBackup: string | null;
  managementIpv6: string;
  ipv6Enabled: boolean;
}

interface PortFormData {
  oltDeviceId: string;
  portNumber: number;
  portType: string;
  subscriberId: string;
  lineProfileId: string;
  serviceProfileId: string;
}

interface Area {
  id: string;
  name: string;
  code: string;
}

interface SplitterItem {
  id: string;
  oltId: string;
  portId: string;
  name: string;
  type: string;
  splitRatio: string;
  ratio: string;
  location: string;
  connectedCount: number;
  maxCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface OltTemplate {
  id: string;
  name: string;
  description: string;
  vendor: string;
  ponType: string;
  config: string;
  createdAt: string;
  updatedAt: string;
}

interface PortHistoryEntry {
  id: string;
  portId: string;
  status: string;
  changedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────
const OLT_VENDORS = [
  "HUAWEI", "ZTE", "VSOL", "BDCOM", "MIKROTIK",
  "NOKIA", "C_DATA", "FIBERHOME", "REALTEK", "DASAN",
  "ZYXEL", "CTC_UNION", "O_NET", "ABOCOM", "RUIJIE", "H3C",
  "ZHONE", "CALIX", "ADTRAN",
  "CISCO", "JUNIPER", "UBIQUITI", "TP_LINK", "ARUBA", "FORTINET",
  "OTHER",
];
const PORT_TYPES = ["PON", "GPON", "EPON", "XGSPON", "XGPON", "COMBO"];
const SPLITTER_TYPES = ["1:2", "1:4", "1:8", "1:16", "1:32"];
const SPLITTER_STATUSES = ["ACTIVE", "INACTIVE"];
const PON_TYPES = ["GPON", "XGSPON", "XGPON"];
const PAGE_SIZE = 9;

const STATUS_CONFIG: Record<string, { label: string; variant: string; dotClass: string }> = {
  ONLINE: { label: "Online", variant: "default", dotClass: "bg-green-500" },
  OFFLINE: { label: "Offline", variant: "destructive", dotClass: "bg-red-500" },
  WARNING: { label: "Warning", variant: "outline", dotClass: "bg-yellow-500" },
  UNKNOWN: { label: "Unknown", variant: "secondary", dotClass: "bg-gray-400" },
  MAINTENANCE: { label: "Maintenance", variant: "outline", dotClass: "bg-slate-400" },
};

const PORT_STATUS_BADGE: Record<string, { variant: string; class: string; dotClass: string }> = {
  free: { variant: "secondary", class: "bg-gray-100 text-gray-700 border-gray-200", dotClass: "bg-gray-400" },
  active: { variant: "default", class: "bg-green-100 text-green-700 border-green-200", dotClass: "bg-green-500" },
  disabled: { variant: "outline", class: "bg-yellow-100 text-yellow-700 border-yellow-200", dotClass: "bg-yellow-500" },
  fault: { variant: "destructive", class: "bg-red-100 text-red-700 border-red-200", dotClass: "bg-red-500" },
};

function getPowerStatus(power: number | null): { label: string; class: string; dotClass: string } {
  if (power == null) return { label: "N/A", class: "text-muted-foreground", dotClass: "bg-gray-300" };
  if (power > -20) return { label: "Good", class: "text-green-600", dotClass: "bg-green-500" };
  if (power > -25) return { label: "Fair", class: "text-yellow-600", dotClass: "bg-yellow-500" };
  return { label: "Weak", class: "text-red-600", dotClass: "bg-red-500" };
}

function getUtilColor(pct: number): string {
  if (pct > 90) return "bg-red-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-green-500";
}

function getUtilTextColor(pct: number): string {
  if (pct > 90) return "text-red-600";
  if (pct >= 70) return "text-yellow-600";
  return "text-green-600";
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const MONITOR_PROTOCOL_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; class: string }> = {
  SNMP: { label: "SNMP", variant: "default", class: "bg-green-100 text-green-700 border-green-200" },
  SNMP_V3: { label: "SNMPv3", variant: "default", class: "bg-blue-100 text-blue-700 border-blue-200" },
  SSH: { label: "SSH", variant: "outline", class: "bg-purple-100 text-purple-700 border-purple-200" },
  TELNET: { label: "Telnet", variant: "outline", class: "bg-orange-100 text-orange-700 border-orange-200" },
  API: { label: "API", variant: "secondary", class: "bg-slate-100 text-slate-700 border-slate-200" },
  HTTP: { label: "HTTP", variant: "secondary", class: "bg-slate-100 text-slate-700 border-slate-200" },
};

// ─── Component ────────────────────────────────────────────────────
export default function FtthGponPage() {
  const { isModuleEnabled } = useModuleStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [selectedOlt, setSelectedOlt] = useState<OltDevice | null>(null);
  const [subscriberSearch, setSubscriberSearch] = useState("");
  const [subscriberResults, setSubscriberResults] = useState<{ id: string; name: string; code: string }[]>([]);
  const [subscriberDropdownOpen, setSubscriberDropdownOpen] = useState(false);
  const [oltDetailOpen, setOltDetailOpen] = useState(false);

  // Add/Edit OLT
  const [oltFormOpen, setOltFormOpen] = useState(false);
  const [editingOlt, setEditingOlt] = useState<OltDevice | null>(null);
  const [oltForm, setOltForm] = useState({
    name: "", vendor: "HUAWEI", model: "", serialNumber: "", firmwareVersion: "",
    ipAddress: "", port: 22, apiPort: 8080, username: "admin", password: "",
    location: "", areaId: "",
    monitorProtocol: "SNMP",
    snmpCommunity: "public", snmpVersion: "2c", snmpPort: 161,
    snmpv3User: "", snmpv3AuthProto: "MD5", snmpv3PrivProto: "DES",
    autoBackup: false, backupSchedule: "daily",
    managementIpv6: "", ipv6Enabled: false, ipv6Gateway: "",
  });
  const [oltFormErrors, setOltFormErrors] = useState<string[]>([]);
  const [monitorSectionOpen, setMonitorSectionOpen] = useState(false);
  const [backupSectionOpen, setBackupSectionOpen] = useState(false);
  const [ipv6SectionOpen, setIpv6SectionOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // Add/Edit Port
  const [portFormOpen, setPortFormOpen] = useState(false);
  const [editingPort, setEditingPort] = useState<OltPort | null>(null);
  const [portForm, setPortForm] = useState<PortFormData>({
    oltDeviceId: "", portNumber: 1, portType: "PON",
    subscriberId: "", lineProfileId: "", serviceProfileId: "",
  });

  // Delete
  const [deleteOltOpen, setDeleteOltOpen] = useState(false);
  const [deletePortOpen, setDeletePortOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Reboot confirmation (Feature 4)
  const [rebootDialogOpen, setRebootDialogOpen] = useState(false);
  const [rebootOltId, setRebootOltId] = useState<string | null>(null);
  const [rebootOltName, setRebootOltName] = useState("");

  // Splitters state (Feature 1)
  const [splitterFormOpen, setSplitterFormOpen] = useState(false);
  const [editingSplitter, setEditingSplitter] = useState<SplitterItem | null>(null);
  const [splitterForm, setSplitterForm] = useState({ oltId: "", portId: "", name: "", type: "1:8", location: "", status: "ACTIVE" });
  const [deleteSplitterId, setDeleteSplitterId] = useState<string | null>(null);
  const [splitterSearch, setSplitterSearch] = useState("");
  const [splitterStatusFilter, setSplitterStatusFilter] = useState("");

  // Templates state (Feature 2)
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<OltTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: "", description: "", vendor: "", ponType: "GPON", config: "{}" });
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  // Port Status History (Feature 5)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyPortId, setHistoryPortId] = useState<string | null>(null);
  const [historyPortName, setHistoryPortName] = useState("");

  // Inline subscriber assignment per port (Feature 3)
  const [inlineSubscriberSearch, setInlineSubscriberSearch] = useState<Record<string, string>>({});
  const [inlineDropdownOpen, setInlineDropdownOpen] = useState<Record<string, boolean>>({});

  // Pagination
  const [oltPage, setOltPage] = useState(1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ─── Queries ───
  const { data, isLoading } = useQuery<{
    olts: OltDevice[];
    summary: { totalOlts: number; onlineOlts: number; totalPorts: number; usedPorts: number; freePorts: number; totalSubscribers: number; overallUtilization: number };
  }>({
    queryKey: ["ftth-olts"],
    queryFn: () => apiFetch("/api/ftth/olts"),
  });

  const { data: areas } = useQuery<Area[]>({
    queryKey: ["areas-list"],
    queryFn: async () => {
      try {
        const res: any = await apiFetch("/api/areas?limit=100");
        if (Array.isArray(res)) return res;
        if (res?.items && Array.isArray(res.items)) return res.items;
        return [];
      } catch {
        return [];
      }
    },
  });

  const { data: oltDetail } = useQuery<{
    olt: OltDevice;
  }>({
    queryKey: ["ftth-olt-detail", selectedOlt?.id],
    queryFn: () => apiFetch(`/api/ftth/olts/${selectedOlt?.id}`),
    enabled: !!selectedOlt?.id && oltDetailOpen,
  });

  // Templates query
  const { data: templatesData } = useQuery<{ templates: OltTemplate[] }>({
    queryKey: ["ftth-templates"],
    queryFn: () => apiFetch("/api/ftth/templates"),
  });
  const templates = templatesData?.templates || [];

  // Splitters query
  const { data: splittersData, isLoading: splittersLoading } = useQuery<{ splitters: SplitterItem[] }>({
    queryKey: ["ftth-splitters", splitterStatusFilter, splitterSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (splitterStatusFilter) params.set("status", splitterStatusFilter);
      if (splitterSearch) params.set("search", splitterSearch);
      return apiFetch(`/api/ftth/splitters?${params.toString()}`);
    },
  });
  const splitters = splittersData?.splitters || [];

  // Port history query
  const { data: portHistory, isLoading: historyLoading } = useQuery<{ history: PortHistoryEntry[] }>({
    queryKey: ["port-history", historyPortId],
    queryFn: () => apiFetch(`/api/ftth/ports/status-history?portId=${historyPortId}`),
    enabled: !!historyPortId,
  });

  // Subscriber autocomplete for port form
  const { data: subscriberList } = useQuery<{ subscribers?: { id: string; name: string; code: string }[]; items?: { id: string; name: string; code: string }[] }>({
    queryKey: ["subscriber-autocomplete", subscriberSearch],
    queryFn: () => apiFetch(`/api/subscribers?search=${encodeURIComponent(subscriberSearch)}&limit=10`),
    enabled: subscriberSearch.length > 1,
  });

  // ─── Mutations ───
  const createOltMutation = useMutation({
    mutationFn: (formData: typeof oltForm) =>
      apiFetch("/api/ftth/olts", { method: "POST", body: JSON.stringify({ ...formData, areaId: formData.areaId || undefined }) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("OLT added successfully");
      setOltFormOpen(false);
      resetOltForm();
      queryClient.invalidateQueries({ queryKey: ["ftth-olts"] });
    },
  });

  const updateOltMutation = useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: typeof oltForm & { status?: string } }) =>
      apiFetch(`/api/ftth/olts/${id}`, { method: "PUT", body: JSON.stringify({ ...formData, areaId: formData.areaId || null }) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("OLT updated successfully");
      setOltFormOpen(false);
      setEditingOlt(null);
      queryClient.invalidateQueries({ queryKey: ["ftth-olts"] });
    },
  });

  const deleteOltMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ftth/olts/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("OLT deleted successfully");
      setDeleteOltOpen(false);
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["ftth-olts"] });
    },
    onError: () => toast.error("Failed to delete OLT"),
  });

  // Feature 4: OLT Reboot via dedicated endpoint
  const rebootMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/ftth/olts/${id}/reboot`, { method: "POST" }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "OLT reboot initiated — status set to MAINTENANCE");
      setRebootDialogOpen(false);
      setRebootOltId(null);
      setRebootOltName("");
      queryClient.invalidateQueries({ queryKey: ["ftth-olts"] });
      if (selectedOlt) queryClient.invalidateQueries({ queryKey: ["ftth-olt-detail", selectedOlt.id] });
    },
    onError: () => toast.error("Failed to reboot OLT"),
  });

  const createPortMutation = useMutation({
    mutationFn: (formData: PortFormData) =>
      apiFetch("/api/ftth/ports", { method: "POST", body: JSON.stringify(formData) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Port added successfully");
      setPortFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["ftth-olts"] });
      if (selectedOlt) queryClient.invalidateQueries({ queryKey: ["ftth-olt-detail", selectedOlt.id] });
    },
  });

  const updatePortMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PortFormData & { status: string }> }) =>
      apiFetch(`/api/ftth/ports/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Port updated successfully");
      setPortFormOpen(false);
      setEditingPort(null);
      queryClient.invalidateQueries({ queryKey: ["ftth-olts"] });
      if (selectedOlt) queryClient.invalidateQueries({ queryKey: ["ftth-olt-detail", selectedOlt.id] });
    },
  });

  const deletePortMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ftth/ports/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Port deleted");
      setDeletePortOpen(false);
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["ftth-olts"] });
      if (selectedOlt) queryClient.invalidateQueries({ queryKey: ["ftth-olt-detail", selectedOlt.id] });
    },
  });

  // Feature 3: Inline subscriber assignment mutation
  const assignSubscriberMutation = useMutation({
    mutationFn: ({ portId, subscriberId }: { portId: string; subscriberId: string | null }) =>
      apiFetch(`/api/ftth/ports/${portId}`, { method: "PUT", body: JSON.stringify({ subscriberId: subscriberId || "" }) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Subscriber assigned to port");
      queryClient.invalidateQueries({ queryKey: ["ftth-olts"] });
      if (selectedOlt) queryClient.invalidateQueries({ queryKey: ["ftth-olt-detail", selectedOlt.id] });
    },
    onError: () => toast.error("Failed to assign subscriber"),
  });

  // Splitter mutations
  const createSplitterMutation = useMutation({
    mutationFn: (body: typeof splitterForm) => apiFetch("/api/ftth/splitters", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Splitter created");
      setSplitterFormOpen(false);
      resetSplitterForm();
      queryClient.invalidateQueries({ queryKey: ["ftth-splitters"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create splitter"),
  });

  const updateSplitterMutation = useMutation({
    mutationFn: (body: typeof splitterForm & { id: string }) => apiFetch("/api/ftth/splitters", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Splitter updated");
      setSplitterFormOpen(false);
      setEditingSplitter(null);
      queryClient.invalidateQueries({ queryKey: ["ftth-splitters"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update splitter"),
  });

  const deleteSplitterMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ftth/splitters?id=${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Splitter deleted");
      setDeleteSplitterId(null);
      queryClient.invalidateQueries({ queryKey: ["ftth-splitters"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete splitter"),
  });

  // Template mutations
  const createTemplateMutation = useMutation({
    mutationFn: (body: typeof templateForm) => apiFetch("/api/ftth/templates", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Template created");
      setTemplateFormOpen(false);
      resetTemplateForm();
      queryClient.invalidateQueries({ queryKey: ["ftth-templates"] });
    },
    onError: () => toast.error("Failed to create template"),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: (body: typeof templateForm & { id: string }) => apiFetch("/api/ftth/templates", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Template updated");
      setTemplateFormOpen(false);
      setEditingTemplate(null);
      queryClient.invalidateQueries({ queryKey: ["ftth-templates"] });
    },
    onError: () => toast.error("Failed to update template"),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/ftth/templates?id=${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Template deleted");
      setDeleteTemplateId(null);
      queryClient.invalidateQueries({ queryKey: ["ftth-templates"] });
    },
    onError: () => toast.error("Failed to delete template"),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ftth/olts/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ftth-olts-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => toast.success("CSV exported successfully"),
    onError: () => toast.error("Failed to export CSV"),
  });

  // ─── Helpers ───
  function resetOltForm() {
    setOltForm({
      name: "", vendor: "HUAWEI", model: "", serialNumber: "", firmwareVersion: "",
      ipAddress: "", port: 22, apiPort: 8080, username: "admin", password: "",
      location: "", areaId: "",
      monitorProtocol: "SNMP",
      snmpCommunity: "public", snmpVersion: "2c", snmpPort: 161,
      snmpv3User: "", snmpv3AuthProto: "MD5", snmpv3PrivProto: "DES",
      autoBackup: false, backupSchedule: "daily",
      managementIpv6: "", ipv6Enabled: false, ipv6Gateway: "",
    });
    setOltFormErrors([]);
    setEditingOlt(null);
  }

  function resetSplitterForm() {
    setSplitterForm({ oltId: "", portId: "", name: "", type: "1:8", location: "", status: "ACTIVE" });
    setEditingSplitter(null);
  }

  function resetTemplateForm() {
    setTemplateForm({ name: "", description: "", vendor: "", ponType: "GPON", config: "{}" });
    setEditingTemplate(null);
  }

  function validatePortForm(f: PortFormData): boolean {
    const errors: string[] = [];
    if (!f.oltDeviceId.trim()) errors.push("OLT Device ID is required");
    if (f.portNumber < 0 || f.portNumber > 128) errors.push("Port number must be between 0 and 128");
    if (errors.length > 0) { toast.error(errors.join(", ")); return false; }
    return true;
  }

  function isValidIPv6(addr: string): boolean {
    // Basic IPv6 validation: supports full, compressed (::), and mixed notation
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::)$/;
    return ipv6Regex.test(addr);
  }

  function validateOltForm(f: typeof oltForm): boolean {
    const errors: string[] = [];
    if (!f.name.trim()) errors.push("OLT name is required");
    if (!f.ipAddress.trim()) errors.push("IP address is required");
    else if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(f.ipAddress.trim())) errors.push("Invalid IP address format");
    if (f.port < 1 || f.port > 65535) errors.push("Port must be between 1 and 65535");
    if (f.ipv6Enabled) {
      if (!f.managementIpv6.trim()) errors.push("Management IPv6 address is required when IPv6 is enabled");
      else if (!isValidIPv6(f.managementIpv6.trim())) errors.push("Invalid IPv6 address format");
      if (f.ipv6Gateway.trim() && !isValidIPv6(f.ipv6Gateway.trim())) errors.push("Invalid IPv6 gateway format");
    }
    setOltFormErrors(errors);
    return errors.length === 0;
  }

  function openAddOlt() { resetOltForm(); setOltFormOpen(true); }

  function openEditOlt(olt: OltDevice) {
    setEditingOlt(olt);
    setOltForm({
      name: olt.name, vendor: olt.vendor, model: olt.model,
      serialNumber: olt.serialNumber || "", firmwareVersion: olt.firmwareVersion || "",
      ipAddress: olt.ipAddress, port: olt.port || 22, apiPort: olt.apiPort || 8080,
      username: olt.username || "admin", password: "",
      location: olt.location, areaId: olt.areaId || "",
      monitorProtocol: olt.monitorProtocol || "SNMP",
      snmpCommunity: olt.snmpCommunity || "public", snmpVersion: olt.snmpVersion || "2c", snmpPort: olt.snmpPort || 161,
      snmpv3User: olt.snmpv3User || "", snmpv3AuthProto: olt.snmpv3AuthProto || "MD5", snmpv3PrivProto: olt.snmpv3PrivProto || "DES",
      autoBackup: olt.autoBackup || false, backupSchedule: olt.backupSchedule || "daily",
      managementIpv6: olt.managementIpv6 || "", ipv6Enabled: olt.ipv6Enabled || false, ipv6Gateway: "",
    });
    setOltFormErrors([]);
    setOltFormOpen(true);
  }

  function openAddPort(oltId: string) {
    setEditingPort(null);
    setPortForm({ oltDeviceId: oltId, portNumber: 1, portType: "PON", subscriberId: "", lineProfileId: "", serviceProfileId: "" });
    setPortFormOpen(true);
  }

  function openEditPort(port: OltPort, oltId: string) {
    setEditingPort(port);
    setPortForm({ oltDeviceId: oltId, portNumber: port.portNumber, portType: port.portType, subscriberId: port.subscriber?.id || "", lineProfileId: port.lineProfileId, serviceProfileId: port.serviceProfileId });
    setPortFormOpen(true);
  }

  function openOltDetail(olt: OltDevice) {
    setSelectedOlt(olt);
    setOltDetailOpen(true);
  }

  // Feature 4: Reboot with confirmation
  function openRebootDialog(olt: OltDevice) {
    setRebootOltId(olt.id);
    setRebootOltName(olt.name);
    setRebootDialogOpen(true);
  }

  // Feature 5: Port history
  function openHistoryDialog(port: OltPort) {
    setHistoryPortId(port.id);
    setHistoryPortName(`PON 0/${port.portNumber}`);
    setHistoryDialogOpen(true);
  }

  // Splitters
  function openAddSplitter() { resetSplitterForm(); setSplitterFormOpen(true); }

  function openEditSplitter(s: SplitterItem) {
    setEditingSplitter(s);
    setSplitterForm({ oltId: s.oltId, portId: s.portId, name: s.name, type: s.type || s.splitRatio, location: s.location || "", status: s.status });
    setSplitterFormOpen(true);
  }

  // Templates
  function openAddTemplate() { resetTemplateForm(); setTemplateFormOpen(true); }

  function openEditTemplate(t: OltTemplate) {
    setEditingTemplate(t);
    setTemplateForm({ name: t.name, description: t.description, vendor: t.vendor, ponType: t.ponType, config: t.config });
    setTemplateFormOpen(true);
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSubscriberDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ─── Filter & Paginate ───
  const filteredOlts = (data?.olts || []).filter((o) => {
    const matchSearch = !search || o.name.toLowerCase().includes(search.toLowerCase()) || o.ipAddress.includes(search) || o.location.toLowerCase().includes(search.toLowerCase());
    const matchArea = !areaFilter || o.areaId === areaFilter;
    return matchSearch && matchArea;
  });
  const totalOltPages = Math.ceil(filteredOlts.length / PAGE_SIZE);
  const paginatedOlts = filteredOlts.slice((oltPage - 1) * PAGE_SIZE, oltPage * PAGE_SIZE);

  // Feature 6: Capacity data derived from OLT list
  const capacityOlts = data?.olts || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="skeleton-wave h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">FTTH / GPON</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage OLT devices, PON ports, splitters, and fiber network infrastructure.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
            <Download className="h-4 w-4 mr-2" />Export CSV
          </Button>
          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openAddOlt}>
            <Plus className="h-4 w-4 mr-2" />Add OLT
          </Button>
        </div>
      </div>

      <Tabs defaultValue="olts" className="space-y-4">
        <TabsList className="bg-muted p-1 h-auto flex flex-wrap">
          <TabsTrigger value="olts" className="text-xs sm:text-sm gap-1.5"><Server className="h-3.5 w-3.5" />OLTs</TabsTrigger>
          <TabsTrigger value="splitters" className="text-xs sm:text-sm gap-1.5"><SplitterIcon className="h-3.5 w-3.5" />Splitters</TabsTrigger>
          <TabsTrigger value="templates" className="text-xs sm:text-sm gap-1.5"><FileText className="h-3.5 w-3.5" />Templates</TabsTrigger>
          <TabsTrigger value="capacity" className="text-xs sm:text-sm gap-1.5"><LayoutDashboard className="h-3.5 w-3.5" />Capacity</TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════
            TAB 1: OLTs
           ══════════════════════════════════════════════════════════ */}
        <TabsContent value="olts">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border shadow-sm animate-card-enter" style={{ animationDelay: "0ms" }}><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/30"><Server className="h-4 w-4 text-teal-600" /></div><div><p className="text-2xl font-bold tabular-nums">{data?.summary?.totalOlts || 0}</p><p className="text-xs text-muted-foreground">Total OLTs</p></div></div></CardContent></Card>
            <Card className="border shadow-sm animate-card-enter" style={{ animationDelay: "60ms" }}><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30"><Wifi className="h-4 w-4 text-green-600" /></div><div><p className="text-2xl font-bold tabular-nums text-green-600">{data?.summary?.onlineOlts || 0}</p><p className="text-xs text-muted-foreground">Online OLTs</p></div></div></CardContent></Card>
            <Card className="border shadow-sm animate-card-enter" style={{ animationDelay: "120ms" }}><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30"><Radio className="h-4 w-4 text-purple-600" /></div><div><p className="text-2xl font-bold tabular-nums">{data?.summary?.totalPorts || 0}</p><p className="text-xs text-muted-foreground">Total Ports ({data?.summary?.usedPorts || 0} used)</p></div></div></CardContent></Card>
            <Card className="border shadow-sm animate-card-enter" style={{ animationDelay: "180ms" }}><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30"><Users className="h-4 w-4 text-orange-600" /></div><div><p className="text-2xl font-bold tabular-nums">{data?.summary?.totalSubscribers || 0}</p><p className="text-xs text-muted-foreground">FTTH Subscribers</p></div></div></CardContent></Card>
          </div>

          {/* Overall Utilization */}
          {(data?.summary?.totalPorts ?? 0) > 0 && (
            <Card className="border shadow-sm"><CardContent className="p-4">
              <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">Overall Port Utilization</span><span className="text-sm font-bold tabular-nums">{data?.summary?.overallUtilization ?? 0}%</span></div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all duration-700 ${getUtilColor(data?.summary?.overallUtilization ?? 0)}`} style={{ width: `${data?.summary?.overallUtilization ?? 0}%` }} /></div>
              <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground"><span>{data?.summary?.usedPorts ?? 0} ports used</span><span>{data?.summary?.freePorts ?? 0} ports available</span></div>
            </CardContent></Card>
          )}

          {/* Search & Area Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search OLTs by name, IP, or location..." value={search} onChange={(e) => { setSearch(e.target.value); setOltPage(1); }} className="pl-9" /></div>
            <Select value={areaFilter} onValueChange={(v) => { setAreaFilter(v === "_all" ? "" : v); setOltPage(1); }}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Filter by Area" /></SelectTrigger>
              <SelectContent><SelectItem value="_all">All Areas</SelectItem>{(Array.isArray(areas) ? areas : []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.code})</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* OLT Cards Grid */}
          {filteredOlts.length === 0 ? (
            <Card className="border shadow-sm"><CardContent className="py-16 text-center text-muted-foreground">{search ? "No OLTs match your search." : "No OLTs found. Click Add OLT to register your first OLT device."}</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginatedOlts.map((olt) => {
                const sc = STATUS_CONFIG[olt.status] || STATUS_CONFIG.UNKNOWN;
                return (
                  <Card key={olt.id} className="border shadow-sm hover:shadow-lg hover:border-red-200 dark:hover:border-red-900/40 transition-all duration-200 hover:-translate-y-0.5 animate-card-enter group">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sc.dotClass} ${olt.status === "ONLINE" ? "animate-cryptsk-pulse" : ""}`} />
                          <div className="min-w-0"><h3 className="font-semibold text-sm truncate">{olt.name}</h3><p className="text-[11px] text-muted-foreground font-mono">{olt.ipAddress}</p>{isModuleEnabled("ipv6") && olt.ipv6Enabled && (<div className="text-xs"><Badge variant="outline" className="text-[10px]"><Globe className="h-2.5 w-2.5 mr-0.5" />IPv6</Badge><span className="font-mono ml-1 text-[11px] text-muted-foreground">{olt.managementIpv6}</span></div>)}</div>
                        </div>
                        <Badge variant={sc.variant as "default" | "destructive" | "outline" | "secondary"} className="text-[10px] flex-shrink-0">{sc.label}</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs mb-3">
                        <div><span className="text-muted-foreground">Vendor: </span><span className="font-medium">{olt.vendor}</span></div>
                        <div><span className="text-muted-foreground">Model: </span><span className="font-medium">{olt.model || "—"}</span></div>
                        <div><span className="text-muted-foreground">Serial: </span><span className="font-mono font-medium truncate">{olt.serialNumber || "—"}</span></div>
                        <div><span className="text-muted-foreground">Location: </span><span className="font-medium truncate">{olt.location || "—"}</span></div>
                        <div><span className="text-muted-foreground">Firmware: </span><span className="font-medium truncate">{olt.firmwareVersion || "—"}</span></div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Protocol: </span>
                          <Badge variant={(MONITOR_PROTOCOL_CONFIG[olt.monitorProtocol]?.variant || "secondary") as "default" | "secondary" | "outline" | "destructive"} className={`text-[10px] h-4 px-1.5 ${MONITOR_PROTOCOL_CONFIG[olt.monitorProtocol]?.class || ""}`}>{MONITOR_PROTOCOL_CONFIG[olt.monitorProtocol]?.label || olt.monitorProtocol || "SNMP"}</Badge>
                        </div>
                        <div><span className="text-muted-foreground">Subscribers: </span><span className="font-medium">{olt.subscriberCount}</span></div>
                        <div><span className="text-muted-foreground">Area: </span><span className="font-medium truncate">{olt.areaName || "—"}</span></div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{formatUptime(olt.uptimeSeconds || 0)}</span>
                        </div>
                      </div>
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs mb-1"><span className="text-muted-foreground">Port Utilization</span><span className={`font-bold tabular-nums ${getUtilTextColor(olt.utilizationPercent)}`}>{olt.utilizationPercent}% ({olt.usedPorts}/{olt.totalPorts})</span></div>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all ${getUtilColor(olt.utilizationPercent)}`} style={{ width: `${Math.min(olt.utilizationPercent, 100)}%` }} /></div>
                      </div>
                      {olt.status === "ONLINE" && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                          <span>CPU: <span className={olt.cpuUsage > 80 ? "text-red-600 font-semibold" : "font-medium"}>{olt.cpuUsage}%</span></span>
                          <span>MEM: <span className={olt.memoryUsage > 80 ? "text-red-600 font-semibold" : "font-medium"}>{olt.memoryUsage}%</span></span>
                          {olt.temperature != null && <span>Temp: <span className="font-medium">{olt.temperature}°C</span></span>}
                        </div>
                      )}
                      {/* Feature 4: Reboot button on OLT card */}
                      <div className="flex items-center gap-1.5 pt-2 border-t">
                        <Button variant="outline" size="sm" className="h-7 text-xs flex-1 opacity-70 group-hover:opacity-100 transition-opacity" onClick={() => openOltDetail(olt)}><Eye className="h-3 w-3 mr-1" />Ports</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs opacity-70 group-hover:opacity-100 transition-opacity" onClick={() => openEditOlt(olt)}><Edit className="h-3 w-3 mr-1" />Edit</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white border-red-600 opacity-70 group-hover:opacity-100 transition-opacity" onClick={() => openRebootDialog(olt)}><RefreshCw className="h-3 w-3 mr-1" />Reboot</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setDeleteId(olt.id); setDeleteOltOpen(true); }}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalOltPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Showing {(oltPage - 1) * PAGE_SIZE + 1}–{Math.min(oltPage * PAGE_SIZE, filteredOlts.length)} of {filteredOlts.length}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={oltPage <= 1} onClick={() => setOltPage((p) => p - 1)}>Prev</Button>
                {Array.from({ length: totalOltPages }, (_, i) => i + 1).map((p) => (
                  <Button key={p} variant={p === oltPage ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs" onClick={() => setOltPage(p)}>{p}</Button>
                ))}
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={oltPage >= totalOltPages} onClick={() => setOltPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}

          {/* ─── OLT Detail / Port Table Dialog ─── */}
          <Dialog open={oltDetailOpen} onOpenChange={setOltDetailOpen}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto" a11yTitle="OLT Details">
              {!oltDetail && selectedOlt ? (
                <div className="space-y-4 py-6"><Skeleton className="skeleton-wave h-6 w-48" /><Skeleton className="skeleton-wave h-40 w-full" /></div>
              ) : (oltDetail?.olt || selectedOlt) ? (() => {
                const oltData = oltDetail?.olt || selectedOlt!;
                return (
                  <>
                    <DialogHeader>
                      <div className="flex items-center gap-2">
                        <DialogTitle>{oltData.name} — PON Ports</DialogTitle>
                        <Badge variant={STATUS_CONFIG[oltData.status]?.variant as "default" | "destructive" | "outline" | "secondary"} className="text-[10px]">{STATUS_CONFIG[oltData.status]?.label}</Badge>
                      </div>
                      <DialogDescription>{oltData.ipAddress} &middot; {oltData.vendor} {oltData.model}{oltData.firmwareVersion ? ` (v${oltData.firmwareVersion})` : ""} &middot; {oltData.totalPorts} ports ({oltData.usedPorts} used){oltData.monitorProtocol ? ` &middot; ${MONITOR_PROTOCOL_CONFIG[oltData.monitorProtocol]?.label || oltData.monitorProtocol}` : ""}</DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center justify-end gap-2">
                      {/* Feature 4: Reboot button in detail dialog */}
                      <Button variant="outline" size="sm" className="h-7 text-xs bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:text-red-700" onClick={() => openRebootDialog(oltData)} disabled={rebootMutation.isPending}>
                        <RefreshCw className={`h-3 w-3 mr-1 ${rebootMutation.isPending ? "animate-spin" : ""}`} />
                        {rebootMutation.isPending ? "Rebooting..." : "Reboot OLT"}
                      </Button>
                      <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white h-7 text-xs" onClick={() => openAddPort(oltData.id)}><Plus className="h-3 w-3 mr-1" />Add Port</Button>
                    </div>
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Port #</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs min-w-[200px]">Subscriber</TableHead>
                            <TableHead className="text-xs">TX Power</TableHead>
                            <TableHead className="text-xs">RX Power</TableHead>
                            <TableHead className="text-xs text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {oltData.ports.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No ports configured. Click Add Port to create one.</TableCell></TableRow>
                          ) : (
                            oltData.ports.map((port) => {
                              const txStatus = getPowerStatus(port.txPower);
                              const rxStatus = getPowerStatus(port.rxPower);
                              return (
                                <TableRow key={port.id} className="hover:bg-red-50/40 dark:hover:bg-red-950/10 transition-colors">
                                  <TableCell className="font-mono text-xs font-medium">PON 0/{port.portNumber}</TableCell>
                                  <TableCell className="text-xs">{port.portType}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1.5">
                                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PORT_STATUS_BADGE[port.status]?.dotClass || "bg-gray-300"}`} />
                                      <Badge variant={PORT_STATUS_BADGE[port.status]?.variant as "default" | "secondary" | "outline" | "destructive" || "secondary"} className={`text-[10px] ${PORT_STATUS_BADGE[port.status]?.class || ""}`}>{port.status}</Badge>
                                    </div>
                                  </TableCell>
                                  {/* Feature 3: Inline subscriber autocomplete per port */}
                                  <TableCell className="text-xs">
                                    {port.subscriber ? (
                                      <div className="flex items-center gap-1">
                                        <div><div className="font-medium">{port.subscriber.name}</div><div className="text-[10px] text-muted-foreground font-mono">{port.subscriber.code}</div>{isModuleEnabled("ipv6") && port.subscriber.ipStackType !== "IPV4_ONLY" && port.subscriber.ipv6Address && (<p className="text-[10px] font-mono text-muted-foreground flex items-center gap-0.5 mt-0.5"><Globe className="h-2.5 w-2.5" />IPv6: {port.subscriber.ipv6Address}</p>)}</div>
                                        <button type="button" className="ml-1 text-muted-foreground hover:text-red-500" onClick={() => assignSubscriberMutation.mutate({ portId: port.id, subscriberId: null })} title="Unassign"><X className="h-3 w-3" /></button>
                                      </div>
                                    ) : (
                                      <div className="relative">
                                        <input
                                          type="text"
                                          className="w-full text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                          placeholder="Search subscriber..."
                                          value={inlineSubscriberSearch[port.id] || ""}
                                          onChange={(e) => { setInlineSubscriberSearch({ ...inlineSubscriberSearch, [port.id]: e.target.value }); setInlineDropdownOpen({ ...inlineDropdownOpen, [port.id]: true }); }}
                                          onFocus={() => { if (inlineSubscriberSearch[port.id]?.length > 1) setInlineDropdownOpen({ ...inlineDropdownOpen, [port.id]: true }); }}
                                        />
                                        {inlineDropdownOpen[port.id] && (inlineSubscriberSearch[port.id]?.length || 0) > 1 && (
                                          <InlineSubscriberDropdown
                                            portId={port.id}
                                            search={inlineSubscriberSearch[port.id] || ""}
                                            onSelect={(sub) => {
                                              assignSubscriberMutation.mutate({ portId: port.id, subscriberId: sub.id });
                                              setInlineSubscriberSearch({ ...inlineSubscriberSearch, [port.id]: "" });
                                              setInlineDropdownOpen({ ...inlineDropdownOpen, [port.id]: false });
                                            }}
                                            onClose={() => setInlineDropdownOpen({ ...inlineDropdownOpen, [port.id]: false })}
                                          />
                                        )}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono">{port.txPower != null ? <span className={`flex items-center gap-1.5 ${txStatus.class}`}><span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${txStatus.dotClass}`} />{port.txPower.toFixed(1)} dBm</span> : "—"}</TableCell>
                                  <TableCell className="text-xs font-mono">{port.rxPower != null ? <span className={`flex items-center gap-1.5 ${rxStatus.class}`}><span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${rxStatus.dotClass}`} />{port.rxPower.toFixed(1)} dBm</span> : "—"}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      {/* Feature 5: History button */}
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openHistoryDialog(port)} title="Status History"><History className="h-3 w-3" /></Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPort(port, oltData.id)}><Edit className="h-3 w-3" /></Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => { setDeleteId(port.id); setDeletePortOpen(true); }}><Trash2 className="h-3 w-3" /></Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                );
              })() : null}
            </DialogContent>
          </Dialog>

          {/* ─── Add/Edit OLT Dialog ─── */}
          <Dialog open={oltFormOpen} onOpenChange={setOltFormOpen}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingOlt ? "Edit OLT" : "Add OLT Device"}</DialogTitle>
                <DialogDescription>{editingOlt ? "Update OLT device configuration." : "Register a new OLT device in the system."}</DialogDescription>
              </DialogHeader>
              {oltFormErrors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">{oltFormErrors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>)}</div>
              )}

              {/* ── Section 1: Device Information ── */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Device Information</h4>
                </div>
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {/* Template selector (add only) */}
                  {!editingOlt && templates.length > 0 && (
                    <div className="sm:col-span-2"><Label className="text-xs">Template (optional)</Label>
                      <Select value={selectedTemplateId} onValueChange={(v) => {
                        setSelectedTemplateId(v);
                        if (v && v !== "__none__") {
                          const tpl = templates.find(t => t.id === v);
                          if (tpl) {
                            setOltForm(prev => ({ ...prev, vendor: tpl.vendor || prev.vendor }));
                            try {
                              const cfg = JSON.parse(tpl.config);
                              if (cfg.defaultPort) setOltForm(prev => ({ ...prev, port: cfg.defaultPort }));
                            } catch {}
                          }
                        }
                      }}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select a template..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No Template</SelectItem>
                          {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.ponType})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="sm:col-span-2"><Label className="text-xs">OLT Name *</Label><Input className="h-8 text-sm" value={oltForm.name} onChange={(e) => setOltForm({ ...oltForm, name: e.target.value })} placeholder="e.g. OLT-Zone1-MA5608T" /></div>
                  <div><Label className="text-xs">Vendor</Label>
                    <Select value={oltForm.vendor} onValueChange={(v) => setOltForm({ ...oltForm, vendor: v })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{OLT_VENDORS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div><Label className="text-xs">Model</Label><Input className="h-8 text-sm" value={oltForm.model} onChange={(e) => setOltForm({ ...oltForm, model: e.target.value })} placeholder="e.g. MA5608T" /></div>
                  <div><Label className="text-xs">Serial Number</Label><Input className="h-8 text-sm font-mono" value={oltForm.serialNumber} onChange={(e) => setOltForm({ ...oltForm, serialNumber: e.target.value })} placeholder="e.g. SN2024010001" /></div>
                  <div><Label className="text-xs">Firmware Version</Label><Input className="h-8 text-sm" value={oltForm.firmwareVersion} onChange={(e) => setOltForm({ ...oltForm, firmwareVersion: e.target.value })} placeholder="e.g. V800R021C10" /></div>
                  <div><Label className="text-xs">IP Address *</Label><Input className="h-8 text-sm font-mono" value={oltForm.ipAddress} onChange={(e) => setOltForm({ ...oltForm, ipAddress: e.target.value })} placeholder="192.168.1.100" /></div>
                  <div><Label className="text-xs">SSH Port</Label><Input type="number" className="h-8 text-sm" value={oltForm.port} onChange={(e) => setOltForm({ ...oltForm, port: parseInt(e.target.value) || 22 })} /></div>
                  <div><Label className="text-xs">API Port</Label><Input type="number" className="h-8 text-sm" value={oltForm.apiPort} onChange={(e) => setOltForm({ ...oltForm, apiPort: parseInt(e.target.value) || 8080 })} /></div>
                  <div><Label className="text-xs">Username</Label><Input className="h-8 text-sm" value={oltForm.username} onChange={(e) => setOltForm({ ...oltForm, username: e.target.value })} /></div>
                  <div><Label className="text-xs">Password</Label><Input type="password" className="h-8 text-sm" value={oltForm.password} onChange={(e) => setOltForm({ ...oltForm, password: e.target.value })} placeholder={editingOlt ? "Leave blank to keep current" : ""} /></div>
                  <div className="sm:col-span-2"><Label className="text-xs">Location</Label><Input className="h-8 text-sm" value={oltForm.location} onChange={(e) => setOltForm({ ...oltForm, location: e.target.value })} placeholder="e.g. Zone 1 Distribution Point" /></div>
                  <div className="sm:col-span-2"><Label className="text-xs">Service Area</Label>
                    <Select value={oltForm.areaId} onValueChange={(v) => setOltForm({ ...oltForm, areaId: v })}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select area (optional)" /></SelectTrigger><SelectContent><SelectItem value="__none__">No Area</SelectItem>{(Array.isArray(areas) ? areas : []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.code})</SelectItem>)}</SelectContent></Select>
                  </div>
                </div>
              </div>

              {/* ── Section 2: Monitoring Protocol ── */}
              <div className="space-y-1 mt-4">
                <button type="button" className="flex items-center justify-between w-full group" onClick={() => setMonitorSectionOpen(!monitorSectionOpen)}>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-sm font-semibold">Monitoring Protocol</h4>
                    <Badge variant={(MONITOR_PROTOCOL_CONFIG[oltForm.monitorProtocol]?.variant || "secondary") as "default" | "secondary" | "outline" | "destructive"} className={`text-[10px] h-4 px-1.5 ${MONITOR_PROTOCOL_CONFIG[oltForm.monitorProtocol]?.class || ""}`}>{MONITOR_PROTOCOL_CONFIG[oltForm.monitorProtocol]?.label || oltForm.monitorProtocol}</Badge>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${monitorSectionOpen ? "rotate-180" : ""}`} />
                </button>
                <Separator />
                {monitorSectionOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div><Label className="text-xs">Protocol Type</Label>
                      <Select value={oltForm.monitorProtocol} onValueChange={(v) => setOltForm({ ...oltForm, monitorProtocol: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SNMP">SNMP (v1/v2c)</SelectItem>
                          <SelectItem value="SNMP_V3">SNMPv3</SelectItem>
                          <SelectItem value="SSH">SSH</SelectItem>
                          <SelectItem value="TELNET">Telnet</SelectItem>
                          <SelectItem value="HTTP">HTTP</SelectItem>
                          <SelectItem value="API">REST API</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* SNMP fields */}
                    {oltForm.monitorProtocol === "SNMP" && (
                      <>
                        <div><Label className="text-xs">Community String</Label><Input className="h-8 text-sm font-mono" value={oltForm.snmpCommunity} onChange={(e) => setOltForm({ ...oltForm, snmpCommunity: e.target.value })} placeholder="public" /></div>
                        <div><Label className="text-xs">SNMP Port</Label><Input type="number" className="h-8 text-sm" value={oltForm.snmpPort} onChange={(e) => setOltForm({ ...oltForm, snmpPort: parseInt(e.target.value) || 161 })} /></div>
                        <div><Label className="text-xs">SNMP Version</Label>
                          <Select value={oltForm.snmpVersion} onValueChange={(v) => setOltForm({ ...oltForm, snmpVersion: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">SNMPv1</SelectItem>
                              <SelectItem value="2c">SNMPv2c</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {/* SNMPv3 fields */}
                    {oltForm.monitorProtocol === "SNMP_V3" && (
                      <>
                        <div><Label className="text-xs">Username</Label><Input className="h-8 text-sm" value={oltForm.snmpv3User} onChange={(e) => setOltForm({ ...oltForm, snmpv3User: e.target.value })} placeholder="snmp user" /></div>
                        <div><Label className="text-xs">Auth Protocol</Label>
                          <Select value={oltForm.snmpv3AuthProto} onValueChange={(v) => setOltForm({ ...oltForm, snmpv3AuthProto: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MD5">MD5</SelectItem>
                              <SelectItem value="SHA">SHA</SelectItem>
                              <SelectItem value="SHA-256">SHA-256</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label className="text-xs">Priv Protocol</Label>
                          <Select value={oltForm.snmpv3PrivProto} onValueChange={(v) => setOltForm({ ...oltForm, snmpv3PrivProto: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DES">DES</SelectItem>
                              <SelectItem value="AES-128">AES-128</SelectItem>
                              <SelectItem value="AES-256">AES-256</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label className="text-xs">SNMP Port</Label><Input type="number" className="h-8 text-sm" value={oltForm.snmpPort} onChange={(e) => setOltForm({ ...oltForm, snmpPort: parseInt(e.target.value) || 161 })} /></div>
                      </>
                    )}

                    {/* SSH / TELNET - just a note about port */}
                    {(oltForm.monitorProtocol === "SSH" || oltForm.monitorProtocol === "TELNET") && (
                      <div className="sm:col-span-2 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                        <Info className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Connection will use the SSH/Telnet port and credentials defined in Device Information above.</span>
                      </div>
                    )}

                    {/* HTTP / API - just a note about API port */}
                    {(oltForm.monitorProtocol === "HTTP" || oltForm.monitorProtocol === "API") && (
                      <div className="sm:col-span-2 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                        <Info className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Connection will use the API Port defined in Device Information above.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Section 3: Backup Settings ── */}
              <div className="space-y-1 mt-4">
                <button type="button" className="flex items-center justify-between w-full group" onClick={() => setBackupSectionOpen(!backupSectionOpen)}>
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-sm font-semibold">Backup Settings</h4>
                    {oltForm.autoBackup && <Badge variant="default" className="text-[10px] h-4 px-1.5 bg-green-100 text-green-700 border-green-200">Active</Badge>}
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${backupSectionOpen ? "rotate-180" : ""}`} />
                </button>
                <Separator />
                {backupSectionOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="flex items-center justify-between sm:col-span-2">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-medium">Auto Backup</Label>
                        <p className="text-[11px] text-muted-foreground">Automatically backup OLT configuration on schedule</p>
                      </div>
                      <Switch checked={oltForm.autoBackup} onCheckedChange={(checked) => setOltForm({ ...oltForm, autoBackup: checked })} />
                    </div>
                    {oltForm.autoBackup && (
                      <div><Label className="text-xs">Backup Schedule</Label>
                        <Select value={oltForm.backupSchedule} onValueChange={(v) => setOltForm({ ...oltForm, backupSchedule: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Section 4: IPv6 Management (gated by ipv6 module) ── */}
              {isModuleEnabled("ipv6") && (
              <div className="space-y-1 mt-4">
                <button type="button" className="flex items-center justify-between w-full group" onClick={() => setIpv6SectionOpen(!ipv6SectionOpen)}>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-sm font-semibold">IPv6 Management</h4>
                    {oltForm.ipv6Enabled && <Badge variant="default" className="text-[10px] h-4 px-1.5 bg-green-100 text-green-700 border-green-200">Active</Badge>}
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${ipv6SectionOpen ? "rotate-180" : ""}`} />
                </button>
                <Separator />
                {ipv6SectionOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="flex items-center justify-between sm:col-span-2">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-medium">Enable IPv6 Management</Label>
                        <p className="text-[11px] text-muted-foreground">Allow OLT management via IPv6 address</p>
                      </div>
                      <Switch checked={oltForm.ipv6Enabled} onCheckedChange={(checked) => setOltForm({ ...oltForm, ipv6Enabled: checked })} />
                    </div>
                    {oltForm.ipv6Enabled && (
                      <>
                        <div><Label className="text-xs">Management IPv6 Address</Label><Input className="h-8 text-sm font-mono" value={oltForm.managementIpv6} onChange={(e) => setOltForm({ ...oltForm, managementIpv6: e.target.value })} placeholder="2001:db8:1::1" /></div>
                        <div><Label className="text-xs">IPv6 Gateway</Label><Input className="h-8 text-sm font-mono" value={oltForm.ipv6Gateway} onChange={(e) => setOltForm({ ...oltForm, ipv6Gateway: e.target.value })} placeholder="2001:db8:1::1" /></div>
                      </>
                    )}
                  </div>
                )}
              </div>
              )}

              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setOltFormOpen(false)}>Cancel</Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={createOltMutation.isPending || updateOltMutation.isPending} onClick={() => {
                  if (!validateOltForm(oltForm)) return;
                  if (editingOlt) updateOltMutation.mutate({ id: editingOlt.id, formData: oltForm });
                  else createOltMutation.mutate(oltForm);
                }}>{createOltMutation.isPending || updateOltMutation.isPending ? "Saving..." : editingOlt ? "Save Changes" : "Add OLT"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ─── Add/Edit Port Dialog ─── */}
          <Dialog open={portFormOpen} onOpenChange={setPortFormOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingPort ? "Edit Port" : "Add OLT Port"}</DialogTitle>
                <DialogDescription>{editingPort ? "Update port configuration." : "Configure a new PON port on the OLT."}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div><Label>Port Number</Label><Input type="number" value={portForm.portNumber} onChange={(e) => setPortForm({ ...portForm, portNumber: parseInt(e.target.value) || 1 })} /></div>
                <div><Label>Port Type</Label>
                  <Select value={portForm.portType} onValueChange={(v) => setPortForm({ ...portForm, portType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PORT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="relative" ref={dropdownRef}>
                  <Label>Subscriber (optional)</Label>
                  <div className="relative mt-1">
                    <Input
                      value={portForm.subscriberId ? (subscriberResults.find(s => s.id === portForm.subscriberId)?.name || portForm.subscriberId) : ""}
                      onChange={(e) => { setSubscriberSearch(e.target.value); setSubscriberDropdownOpen(true); if (!e.target.value) setPortForm({ ...portForm, subscriberId: "" }); }}
                      onFocus={() => { if (subscriberSearch.length > 1) setSubscriberDropdownOpen(true); }}
                      placeholder="Search subscriber by name or code..."
                    />
                    {portForm.subscriberId && !subscriberSearch && (
                      <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setPortForm({ ...portForm, subscriberId: "" }); setSubscriberSearch(""); }}><RotateCcw className="h-3.5 w-3.5" /></button>
                    )}
                    {subscriberDropdownOpen && subscriberList && (subscriberList.subscribers || subscriberList.items || []).length > 0 && (
                      <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                        {(subscriberList.subscribers || subscriberList.items || []).map((s) => (
                          <button key={s.id} type="button" className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors" onClick={() => {
                            setPortForm({ ...portForm, subscriberId: s.id });
                            setSubscriberSearch(s.name);
                            setSubscriberDropdownOpen(false);
                            setSubscriberResults(subscriberList.subscribers || subscriberList.items || []);
                          }}><span className="font-medium">{s.name}</span><span className="text-muted-foreground ml-2 font-mono text-xs">{s.code}</span></button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div><Label>Line Profile ID</Label><Input value={portForm.lineProfileId} onChange={(e) => setPortForm({ ...portForm, lineProfileId: e.target.value })} placeholder="e.g. line-profile-100m" /></div>
                <div><Label>Service Profile ID</Label><Input value={portForm.serviceProfileId} onChange={(e) => setPortForm({ ...portForm, serviceProfileId: e.target.value })} placeholder="e.g. svc-profile-100m" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPortFormOpen(false)}>Cancel</Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={createPortMutation.isPending || updatePortMutation.isPending} onClick={() => {
                  if (!validatePortForm(portForm)) return;
                  if (editingPort) updatePortMutation.mutate({ id: editingPort.id, data: portForm });
                  else createPortMutation.mutate(portForm);
                }}>{createPortMutation.isPending || updatePortMutation.isPending ? "Saving..." : editingPort ? "Save Changes" : "Add Port"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ─── Delete OLT Confirm ─── */}
          <AlertDialog open={deleteOltOpen} onOpenChange={setDeleteOltOpen}>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete OLT</AlertDialogTitle><AlertDialogDescription>This will permanently delete the OLT and all its port configurations.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (deleteId) deleteOltMutation.mutate(deleteId); }}>{deleteOltMutation.isPending ? "Deleting..." : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
          </AlertDialog>

          {/* ─── Delete Port Confirm ─── */}
          <AlertDialog open={deletePortOpen} onOpenChange={setDeletePortOpen}>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Port</AlertDialogTitle><AlertDialogDescription>This will remove the port configuration from the OLT.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (deleteId) deletePortMutation.mutate(deleteId); }}>{deletePortMutation.isPending ? "Deleting..." : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
          </AlertDialog>

          {/* Feature 4: Reboot Confirmation Dialog */}
          <AlertDialog open={rebootDialogOpen} onOpenChange={setRebootDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-600" />Confirm OLT Reboot</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to reboot <span className="font-semibold text-foreground">{rebootOltName}</span>? This will set the OLT status to MAINTENANCE. All active services on this OLT may be temporarily disrupted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (rebootOltId) rebootMutation.mutate(rebootOltId); }} disabled={rebootMutation.isPending}>
                  {rebootMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rebooting...</> : "Reboot OLT"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Feature 5: Port Status History Dialog */}
          <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" />Port Status History</DialogTitle>
                <DialogDescription>{historyPortName} — Status change timeline</DialogDescription>
              </DialogHeader>
              {historyLoading ? (
                <div className="space-y-3 py-4"><Skeleton className="skeleton-wave h-10 w-full" /><Skeleton className="skeleton-wave h-10 w-full" /><Skeleton className="skeleton-wave h-10 w-full" /></div>
              ) : portHistory && portHistory.history.length > 0 ? (
                <div className="relative space-y-0">
                  {portHistory.history.map((entry, i) => (
                    <div key={entry.id} className="flex gap-3 pb-4 last:pb-0">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${PORT_STATUS_BADGE[entry.status]?.class?.replace(/border-\S+/g, "").trim() || "bg-gray-400"} ring-2 ring-background`} />
                        {i < portHistory.history.length - 1 && <div className="w-0.5 flex-1 bg-border" />}
                      </div>
                      <div className="flex-1 -mt-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant={PORT_STATUS_BADGE[entry.status]?.variant as "default" | "secondary" | "outline" | "destructive" || "secondary"} className={`text-[10px] ${PORT_STATUS_BADGE[entry.status]?.class || ""}`}>{entry.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(entry.changedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">No status history recorded for this port.</div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════
            TAB 2: Splitters (Feature 1)
           ══════════════════════════════════════════════════════════ */}
        <TabsContent value="splitters">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search splitters..." value={splitterSearch} onChange={(e) => setSplitterSearch(e.target.value)} className="pl-9" /></div>
              <Select value={splitterStatusFilter} onValueChange={(v) => setSplitterStatusFilter(v === "_all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent><SelectItem value="_all">All Status</SelectItem>{SPLITTER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openAddSplitter}><Plus className="h-4 w-4 mr-2" />Add Splitter</Button>
          </div>

          {splittersLoading ? (
            <div className="space-y-3"><Skeleton className="skeleton-wave h-10 w-full" /><Skeleton className="skeleton-wave h-10 w-full" /><Skeleton className="skeleton-wave h-10 w-full" /></div>
          ) : splitters.length === 0 ? (
            <Card className="border shadow-sm"><CardContent className="py-16 text-center text-muted-foreground"><SplitterIcon className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="font-medium">No splitters found</p><p className="text-sm mt-1">Click Add Splitter to create one.</p></CardContent></Card>
          ) : (
            <Card className="border shadow-sm">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Ratio</TableHead>
                    <TableHead className="text-xs">Location</TableHead>
                    <TableHead className="text-xs">Connected</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {splitters.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs font-medium">{s.name || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{s.type || s.splitRatio}</TableCell>
                        <TableCell className="text-xs">{s.ratio || s.splitRatio} ({s.connectedCount}/{s.maxCount})</TableCell>
                        <TableCell className="text-xs">{s.location || "—"}</TableCell>
                        <TableCell className="text-xs"><Progress value={s.maxCount > 0 ? (s.connectedCount / s.maxCount) * 100 : 0} className="h-2 w-16" /><span className="ml-2 text-muted-foreground">{s.connectedCount}/{s.maxCount}</span></TableCell>
                        <TableCell><Badge variant={s.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">{s.status}</Badge></TableCell>
                        <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSplitter(s)}><Edit className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => setDeleteSplitterId(s.id)}><Trash2 className="h-3 w-3" /></Button></div></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Splitter Form Dialog */}
          <Dialog open={splitterFormOpen} onOpenChange={setSplitterFormOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>{editingSplitter ? "Edit Splitter" : "Add Splitter"}</DialogTitle><DialogDescription>{editingSplitter ? "Update splitter configuration." : "Add a new fiber splitter."}</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div><Label>Name</Label><Input value={splitterForm.name} onChange={(e) => setSplitterForm({ ...splitterForm, name: e.target.value })} placeholder="e.g. SPL-Zone1-01" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Type *</Label>
                    <Select value={splitterForm.type} onValueChange={(v) => setSplitterForm({ ...splitterForm, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SPLITTER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div><Label>Status</Label>
                    <Select value={splitterForm.status} onValueChange={(v) => setSplitterForm({ ...splitterForm, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SPLITTER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                  </div>
                </div>
                <div><Label>Location</Label><Input value={splitterForm.location} onChange={(e) => setSplitterForm({ ...splitterForm, location: e.target.value })} placeholder="e.g. Building A, Floor 2" /></div>
                <div><Label>OLT ID</Label><Input value={splitterForm.oltId} onChange={(e) => setSplitterForm({ ...splitterForm, oltId: e.target.value })} placeholder="Network device ID" /></div>
                <div><Label>Port ID</Label><Input value={splitterForm.portId} onChange={(e) => setSplitterForm({ ...splitterForm, portId: e.target.value })} placeholder="OLT port ID" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSplitterFormOpen(false)}>Cancel</Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={createSplitterMutation.isPending || updateSplitterMutation.isPending} onClick={() => {
                  if (editingSplitter) updateSplitterMutation.mutate({ ...splitterForm, id: editingSplitter.id });
                  else createSplitterMutation.mutate(splitterForm);
                }}>{createSplitterMutation.isPending || updateSplitterMutation.isPending ? "Saving..." : editingSplitter ? "Save Changes" : "Add Splitter"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Splitter Confirm */}
          <AlertDialog open={!!deleteSplitterId} onOpenChange={(open) => { if (!open) setDeleteSplitterId(null); }}>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Splitter</AlertDialogTitle><AlertDialogDescription>This will permanently delete this splitter configuration.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (deleteSplitterId) deleteSplitterMutation.mutate(deleteSplitterId); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════
            TAB 3: OLT Templates (Feature 2)
           ══════════════════════════════════════════════════════════ */}
        <TabsContent value="templates">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">{templates.length} template{templates.length !== 1 ? "s" : ""} configured</p>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={openAddTemplate}><Plus className="h-4 w-4 mr-2" />Add Template</Button>
          </div>

          {templates.length === 0 ? (
            <Card className="border shadow-sm"><CardContent className="py-16 text-center text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="font-medium">No OLT templates</p><p className="text-sm mt-1">Create templates to pre-configure OLT settings for common hardware.</p></CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((t) => (
                <Card key={t.id} className="border shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm font-semibold">{t.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px]">{t.ponType}</Badge>
                    </div>
                    {t.vendor && <p className="text-xs text-muted-foreground">{t.vendor}</p>}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{t.description || "No description"}</p>
                    <div className="flex items-center gap-1.5 pt-2 border-t">
                      <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => openEditTemplate(t)}><Edit className="h-3 w-3 mr-1" />Edit</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => setDeleteTemplateId(t.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Template Form Dialog */}
          <Dialog open={templateFormOpen} onOpenChange={setTemplateFormOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>{editingTemplate ? "Edit Template" : "Add OLT Template"}</DialogTitle><DialogDescription>{editingTemplate ? "Update template configuration." : "Create a new OLT configuration template."}</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div><Label>Template Name *</Label><Input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder="e.g. Huawei MA5608T Standard" /></div>
                <div><Label>Description</Label><Textarea value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} placeholder="Describe what this template is for..." rows={2} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Vendor</Label>
                    <Select value={templateForm.vendor} onValueChange={(v) => setTemplateForm({ ...templateForm, vendor: v })}>
                      <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                      <SelectContent><SelectItem value="__none__">None</SelectItem>{OLT_VENDORS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>PON Type *</Label>
                    <Select value={templateForm.ponType} onValueChange={(v) => setTemplateForm({ ...templateForm, ponType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PON_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Config JSON</Label><Textarea value={templateForm.config} onChange={(e) => setTemplateForm({ ...templateForm, config: e.target.value })} placeholder='{"defaultPort": 23, "maxPonPorts": 16}' rows={4} className="font-mono text-xs" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTemplateFormOpen(false)}>Cancel</Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending} onClick={() => {
                  if (!templateForm.name.trim()) { toast.error("Template name is required"); return; }
                  if (editingTemplate) updateTemplateMutation.mutate({ ...templateForm, id: editingTemplate.id });
                  else createTemplateMutation.mutate(templateForm);
                }}>{createTemplateMutation.isPending || updateTemplateMutation.isPending ? "Saving..." : editingTemplate ? "Save Changes" : "Add Template"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Template Confirm */}
          <AlertDialog open={!!deleteTemplateId} onOpenChange={(open) => { if (!open) setDeleteTemplateId(null); }}>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Template</AlertDialogTitle><AlertDialogDescription>This will permanently delete this OLT template.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (deleteTemplateId) deleteTemplateMutation.mutate(deleteTemplateId); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════
            TAB 4: Capacity Planning (Feature 6)
           ══════════════════════════════════════════════════════════ */}
        <TabsContent value="capacity">
          {/* Summary Stats */}
          {(() => {
            const totalP = capacityOlts.reduce((s, o) => s + o.totalPorts, 0);
            const usedP = capacityOlts.reduce((s, o) => s + o.usedPorts, 0);
            const freeP = totalP - usedP;
            const overallUtil = totalP > 0 ? Math.round((usedP / totalP) * 100) : 0;
            const criticalOlts = capacityOlts.filter(o => o.utilizationPercent > 90).length;
            const warningOlts = capacityOlts.filter(o => o.utilizationPercent >= 70 && o.utilizationPercent <= 90).length;
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Port Capacity</p><p className="text-2xl font-bold tabular-nums">{totalP}</p></CardContent></Card>
                  <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Used Ports</p><p className="text-2xl font-bold tabular-nums text-green-600">{usedP}</p></CardContent></Card>
                  <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Free Ports</p><p className="text-2xl font-bold tabular-nums">{freeP}</p></CardContent></Card>
                  <Card className="border shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Overall Utilization</p><p className={`text-2xl font-bold tabular-nums ${getUtilTextColor(overallUtil)}`}>{overallUtil}%</p></CardContent></Card>
                </div>
                {criticalOlts > 0 && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-400"><span className="font-semibold">{criticalOlts}</span> OLT{criticalOlts > 1 ? "s" : ""} at critical capacity (&gt;90%). <span className="font-semibold">{warningOlts}</span> OLT{warningOlts > 1 ? "s" : ""} at warning level (70-90%).</p>
                  </div>
                )}
              </>
            );
          })()}

          {/* Per-OLT Capacity Table */}
          {capacityOlts.length === 0 ? (
            <Card className="border shadow-sm"><CardContent className="py-16 text-center text-muted-foreground"><LayoutDashboard className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="font-medium">No OLTs to analyze</p><p className="text-sm mt-1">Add OLT devices to see capacity planning data.</p></CardContent></Card>
          ) : (
            <Card className="border shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Per-OLT Capacity Overview</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-xs">OLT Name</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Total Ports</TableHead>
                      <TableHead className="text-xs">Used</TableHead>
                      <TableHead className="text-xs">Free</TableHead>
                      <TableHead className="text-xs min-w-[200px]">Utilization</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {capacityOlts.map((olt) => (
                        <TableRow key={olt.id}>
                          <TableCell className="text-xs font-medium"><div>{olt.name}</div><div className="text-[10px] text-muted-foreground font-mono">{olt.ipAddress}</div></TableCell>
                          <TableCell><Badge variant={STATUS_CONFIG[olt.status]?.variant as "default" | "destructive" | "outline" | "secondary"} className="text-[10px]">{STATUS_CONFIG[olt.status]?.label}</Badge></TableCell>
                          <TableCell className="text-xs font-mono tabular-nums">{olt.totalPorts}</TableCell>
                          <TableCell className="text-xs font-mono tabular-nums">{olt.usedPorts}</TableCell>
                          <TableCell className="text-xs font-mono tabular-nums">{olt.freePorts}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 relative h-3 w-full overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all duration-700 ${getUtilColor(olt.utilizationPercent)}`} style={{ width: `${Math.min(olt.utilizationPercent, 100)}%` }} /></div>
                              <span className={`text-xs font-bold tabular-nums w-10 text-right ${getUtilTextColor(olt.utilizationPercent)}`}>{olt.utilizationPercent}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Inline Subscriber Dropdown Component (Feature 3) ────────────
function InlineSubscriberDropdown({ portId, search, onSelect, onClose }: { portId: string; search: string; onSelect: (sub: { id: string; name: string; code: string }) => void; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ subscribers?: { id: string; name: string; code: string }[]; items?: { id: string; name: string; code: string }[] }>({
    queryKey: ["inline-subscriber", portId, search],
    queryFn: () => apiFetch(`/api/subscribers?search=${encodeURIComponent(search)}&limit=10`),
    enabled: search.length > 1,
  });

  const items = data?.subscribers || data?.items || [];

  return (
    <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
      {isLoading ? (
        <div className="px-3 py-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin inline mr-1" />Searching...</div>
      ) : items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">No subscribers found</div>
      ) : (
        items.map((s) => (
          <button key={s.id} type="button" className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors" onClick={() => onSelect(s)}>
            <span className="font-medium">{s.name}</span><span className="text-muted-foreground ml-2 font-mono text-xs">{s.code}</span>
          </button>
        ))
      )}
    </div>
  );
}
