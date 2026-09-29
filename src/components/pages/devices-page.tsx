"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Server, Plus, Search, Edit, Trash2, Eye, RefreshCw,
  Thermometer, Cpu, MemoryStick, Clock, MapPin, Activity,
  Download, ChevronLeft, ChevronRight, CheckSquare, Square,
  CalendarClock, Tag, Timer, AlertTriangle, Zap, Network, History,
  Router, Wifi, Radio, Shield, Monitor, Upload, FileSpreadsheet, Copy,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// ─── Types ────────────────────────────────────────────────────────
interface Device {
  id: string;
  name: string;
  type: string;
  vendor: string;
  model: string;
  ipAddress: string;
  port: number;
  apiPort: number;
  username: string;
  password: string;
  location: string;
  status: string;
  cpuUsage: number;
  memoryUsage: number;
  temperature: number | null;
  uptimeSeconds: number;
  lastSeenAt: string | null;
  autoBackup: boolean;
  tags: string;
  maintenanceStart: string | null;
  maintenanceEnd: string | null;
  maintenanceNote: string;
  monitorProtocol: string;
  snmpCommunity: string;
  snmpVersion: string;
  snmpPort: number;
  area: { name: string; id: string } | null;
  interfaces: { id: string; name: string; status: string }[];
  _count: { oltPorts: number; assignedSubscribers: number; children: number };
  parent?: { id: string; name: string; ipAddress: string } | null;
  children?: { id: string; name: string; status: string }[];
  childrenCount?: number;
  oltPorts?: OltPortDetail[];
  bandwidthLogs?: { downloadBps: number; uploadBps: number; totalBps: number; timestamp: string; interfaceName: string }[];
  configHistory?: { id: string; field: string; oldValue: string; newValue: string; changedBy: string; createdAt: string }[];
}

interface OltPortDetail {
  id: string;
  portNumber: number;
  portType: string;
  status: string;
  txPower: number | null;
  rxPower: number | null;
  subscriber: { id: string; name: string; code: string } | null;
}

interface DeviceFormData {
  name: string;
  type: string;
  vendor: string;
  model: string;
  ipAddress: string;
  port: number;
  apiPort: number;
  username: string;
  password: string;
  monitorProtocol: string;
  snmpCommunity: string;
  snmpVersion: string;
  snmpPort: number;
  snmpv3User: string;
  snmpv3AuthProto: string;
  snmpv3PrivProto: string;
  snmpv3AuthKey: string;
  snmpv3PrivKey: string;
  location: string;
  areaId: string;
  tags: string;
  parentId: string;
  autoBackup: boolean;
  backupSchedule?: string;
}

interface MaintenanceFormData {
  maintenanceStart: string;
  maintenanceEnd: string;
  maintenanceNote: string;
}

const DEVICE_TYPES = [
  { value: "ROUTER", label: "Router", description: "Core/Distribution router" },
  { value: "SWITCH", label: "Switch", description: "L2/L3 Switch" },
  { value: "AP", label: "Access Point", description: "Wireless AP" },
  { value: "OLT", label: "OLT", description: "Optical Line Terminal" },
  { value: "ONU", label: "ONU", description: "Optical Network Unit" },
  { value: "SERVER", label: "Server", description: "Server/BTS" },
  { value: "FIREWALL", label: "Firewall", description: "Firewall/UTM" },
  { value: "GATEWAY", label: "Gateway", description: "PPPoE/BNG Gateway" },
  { value: "BRIDGE", label: "Bridge", description: "Network Bridge" },
  { value: "WIRELESS_BRIDGE", label: "Wireless Bridge", description: "PtP/PtMP Wireless" },
  { value: "OTHER", label: "Other", description: "Other device" },
] as const;

const VENDORS = [
  { value: "MIKROTIK", label: "MikroTik" },
  { value: "CISCO", label: "Cisco" },
  { value: "JUNIPER", label: "Juniper" },
  { value: "HUAWEI", label: "Huawei" },
  { value: "ZTE", label: "ZTE" },
  { value: "VSOL", label: "VSOL" },
  { value: "BDCOM", label: "BDCOM" },
  { value: "UBIQUITI", label: "Ubiquiti" },
  { value: "TP_LINK", label: "TP-Link" },
  { value: "ARUBA", label: "Aruba (HPE)" },
  { value: "FORTINET", label: "Fortinet" },
  { value: "OTHER", label: "Other" },
] as const;

const MONITOR_PROTOCOLS = [
  { value: "SNMP", label: "SNMP v2c", icon: "📡" },
  { value: "SNMP_V3", label: "SNMP v3", icon: "🔒" },
  { value: "API", label: "API (HTTP/REST)", icon: "🌐" },
  { value: "SSH", label: "SSH", icon: "🖥️" },
  { value: "TELNET", label: "Telnet", icon: "💻" },
  { value: "HTTP", label: "HTTP Health Check", icon: "✅" },
] as const;

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "30s", value: 30000 },
  { label: "60s", value: 60000 },
  { label: "120s", value: 120000 },
];

const STATUS_CONFIG: Record<string, { label: string; variant: string; dotClass: string; textClass: string }> = {
  ONLINE: { label: "Online", variant: "default", dotClass: "bg-green-500", textClass: "text-green-700 dark:text-green-400" },
  OFFLINE: { label: "Offline", variant: "destructive", dotClass: "bg-red-500", textClass: "text-red-700 dark:text-red-400" },
  WARNING: { label: "Warning", variant: "outline", dotClass: "bg-amber-500", textClass: "text-amber-700 dark:text-amber-400" },
  UNKNOWN: { label: "Unknown", variant: "secondary", dotClass: "bg-gray-400", textClass: "text-gray-600 dark:text-gray-400" },
  MAINTENANCE: { label: "Maintenance", variant: "outline", dotClass: "bg-yellow-500", textClass: "text-yellow-700 dark:text-yellow-400" },
};

const DEVICE_TYPE_ICONS: Record<string, LucideIcon> = {
  ROUTER: Router,
  SWITCH: Network,
  AP: Wifi,
  OLT: Server,
  ONU: Radio,
  SERVER: Monitor,
  FIREWALL: Shield,
  GATEWAY: Router,
  BRIDGE: Network,
  WIRELESS_BRIDGE: Radio,
  OTHER: Server,
};

const DeviceTypeColorMap: Record<string, string> = {
  ROUTER: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400',
  SWITCH: 'bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400',
  AP: 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  OLT: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  ONU: 'bg-teal-100 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400',
  SERVER: 'bg-slate-100 text-slate-600 dark:bg-slate-950/40 dark:text-slate-400',
  FIREWALL: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400',
  GATEWAY: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400',
  BRIDGE: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  WIRELESS_BRIDGE: 'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400',
};

function getDeviceTypeIcon(type: string): LucideIcon {
  return DEVICE_TYPE_ICONS[type] || Server;
}

function getUsageBarColor(value: number): string {
  if (value > 80) return "bg-red-500";
  if (value >= 50) return "bg-amber-500";
  return "bg-green-500";
}

function MiniProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-1 bg-muted rounded-full overflow-hidden mt-0.5">
      <div
        className={`h-full rounded-full transition-all duration-300 ${getUsageBarColor(value)}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

function formatBytes(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(1)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${bps} bps`;
}

function formatRelativeTime(dateStr: string | null): { text: string; colorClass: string } {
  if (!dateStr) return { text: "Never", colorClass: "text-gray-400" };
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return { text: "Just now", colorClass: "text-green-600" };
  if (diffMin < 5) return { text: `${diffMin} min ago`, colorClass: "text-green-600" };
  if (diffMin < 30) return { text: `${diffMin} min ago`, colorClass: "text-yellow-600" };
  if (diffHour < 1) return { text: `${diffMin} min ago`, colorClass: "text-red-600" };
  if (diffHour < 24) return { text: `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`, colorClass: "text-red-600" };
  return { text: `${diffDay} day${diffDay > 1 ? "s" : ""} ago`, colorClass: "text-red-600" };
}

function parseTags(tagsStr: string): string[] {
  try {
    const parsed = JSON.parse(tagsStr || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return tagsStr.split(",").map((t) => t.trim()).filter(Boolean);
  }
}

const emptyForm: DeviceFormData = {
  name: "", type: "ROUTER", vendor: "OTHER", model: "",
  ipAddress: "", port: 22, apiPort: 8728, username: "admin",
  password: "", monitorProtocol: "SNMP", snmpCommunity: "public",
  snmpVersion: "2c", snmpPort: 161, snmpv3User: "", snmpv3AuthProto: "MD5",
  snmpv3PrivProto: "DES", snmpv3AuthKey: "", snmpv3PrivKey: "",
  location: "", areaId: "", tags: "[]", parentId: "", autoBackup: false,
};

const emptyMaintenanceForm: MaintenanceFormData = {
  maintenanceStart: "",
  maintenanceEnd: "",
  maintenanceNote: "",
};

function DeviceFormContent({
  form, setForm, areasList, allDevices, selectedId, isEdit,
}: {
  form: DeviceFormData;
  setForm: React.Dispatch<React.SetStateAction<DeviceFormData>>;
  areasList: { id: string; name: string }[];
  allDevices: Device[];
  selectedId: string | null;
  isEdit?: boolean;
}) {
  const showSnmp = form.monitorProtocol === "SNMP" || form.monitorProtocol === "SNMP_V3";
  const showSnmpV3 = form.monitorProtocol === "SNMP_V3";
  const selectedType = DEVICE_TYPES.find((t) => t.value === form.type);

  return (
    <div className="space-y-5">
      {/* Basic Info */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Server className="h-4 w-4 text-muted-foreground" />
          Basic Information
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Device Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Core Router 1" />
          </div>
          <div>
            <Label>Device Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {DEVICE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.description}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && (
              <p className="text-[11px] text-muted-foreground mt-1">{selectedType.description}</p>
            )}
          </div>
          <div>
            <Label>Vendor</Label>
            <Select value={form.vendor} onValueChange={(v) => setForm({ ...form, vendor: v })}>
              <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>
                {VENDORS.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Model</Label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="e.g. CCR2004-1G-12S+2XS" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Network */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Network className="h-4 w-4 text-muted-foreground" />
          Network
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>IP Address *</Label>
            <Input value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} placeholder="192.168.1.1" />
          </div>
          <div>
            <Label>SSH Port</Label>
            <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 22 })} />
          </div>
          <div>
            <Label>API Port</Label>
            <Input type="number" value={form.apiPort} onChange={(e) => setForm({ ...form, apiPort: parseInt(e.target.value) || 8728 })} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Monitoring Protocol */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Monitoring Protocol
        </div>
        <RadioGroup value={form.monitorProtocol} onValueChange={(v) => setForm({ ...form, monitorProtocol: v })} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {MONITOR_PROTOCOLS.map((p) => (
            <label
              key={p.value}
              className={`flex items-center gap-2.5 rounded-lg border-2 px-3 py-2.5 cursor-pointer transition-all ${
                form.monitorProtocol === p.value
                  ? "border-primary bg-primary/5 dark:bg-primary/10"
                  : "border-muted hover:border-muted-foreground/30"
              }`}
            >
              <RadioGroupItem value={p.value} className="sr-only" />
              <span className="text-lg">{p.icon}</span>
              <span className="text-xs font-medium">{p.label}</span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* SNMP Settings */}
      {showSnmp && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Radio className="h-4 w-4 text-muted-foreground" />
              SNMP Settings
              {showSnmpV3 && <Badge variant="outline" className="text-[10px]">v3</Badge>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>{showSnmpV3 ? "SNMP Engine ID" : "Community String"}</Label>
                <Input
                  value={form.snmpCommunity}
                  onChange={(e) => setForm({ ...form, snmpCommunity: e.target.value })}
                  placeholder={showSnmpV3 ? "Engine ID" : "public"}
                />
              </div>
              <div>
                <Label>SNMP Port</Label>
                <Input type="number" value={form.snmpPort} onChange={(e) => setForm({ ...form, snmpPort: parseInt(e.target.value) || 161 })} />
              </div>
              {!showSnmpV3 && (
                <div>
                  <Label>SNMP Version</Label>
                  <Select value={form.snmpVersion} onValueChange={(v) => setForm({ ...form, snmpVersion: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">v1</SelectItem>
                      <SelectItem value="2c">v2c</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {showSnmpV3 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div>
                  <Label>Username</Label>
                  <Input value={form.snmpv3User} onChange={(e) => setForm({ ...form, snmpv3User: e.target.value })} placeholder="snmp user" />
                </div>
                <div>
                  <Label>Auth Protocol</Label>
                  <Select value={form.snmpv3AuthProto} onValueChange={(v) => setForm({ ...form, snmpv3AuthProto: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MD5">MD5</SelectItem>
                      <SelectItem value="SHA">SHA</SelectItem>
                      <SelectItem value="SHA-256">SHA-256</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Auth Key</Label>
                  <Input type="password" value={form.snmpv3AuthKey} onChange={(e) => setForm({ ...form, snmpv3AuthKey: e.target.value })} placeholder="Authentication passphrase" />
                </div>
                <div>
                  <Label>Priv Protocol</Label>
                  <Select value={form.snmpv3PrivProto} onValueChange={(v) => setForm({ ...form, snmpv3PrivProto: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DES">DES</SelectItem>
                      <SelectItem value="AES">AES</SelectItem>
                      <SelectItem value="AES-256">AES-256</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>Priv Key</Label>
                  <Input type="password" value={form.snmpv3PrivKey} onChange={(e) => setForm({ ...form, snmpv3PrivKey: e.target.value })} placeholder="Privacy passphrase" />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <Separator />

      {/* Credentials */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Credentials
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Username</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={isEdit ? "Leave blank to keep current" : ""} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Location */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Location
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Data Center Rack 3" />
          </div>
          <div>
            <Label>Area</Label>
            <Select value={form.areaId} onValueChange={(v) => setForm({ ...form, areaId: v })}>
              <SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Area</SelectItem>
                {areasList.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Parent Device</Label>
            <Select value={form.parentId} onValueChange={(v) => setForm({ ...form, parentId: v })}>
              <SelectTrigger><SelectValue placeholder="Select parent (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Parent</SelectItem>
                {allDevices.filter((d) => !isEdit || d.id !== selectedId).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name} ({d.ipAddress})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Tags (comma-separated)</Label>
            <Input
              value={typeof form.tags === "string" ? (() => { try { return JSON.parse(form.tags).join(", "); } catch { return form.tags; } })() : ""}
              onChange={(e) => setForm({ ...form, tags: JSON.stringify(e.target.value.split(",").map((t) => t.trim()).filter(Boolean)) })}
              placeholder="core, production, rack-3"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Backup */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="h-4 w-4 text-muted-foreground" />
          Backup
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={form.autoBackup} onCheckedChange={(checked) => setForm({ ...form, autoBackup: checked })} />
          <Label>Auto Backup</Label>
          {form.autoBackup && <Badge variant="outline" className="text-xs">Enabled</Badge>}
        </div>
        {form.autoBackup && (
          <div className="max-w-xs">
            <Label>Backup Schedule</Label>
            <Select value={form.backupSchedule || "daily"} onValueChange={(v) => setForm({ ...form, backupSchedule: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────
export default function DevicesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [refreshInterval, setRefreshInterval] = useState(0);

  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const importFileInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<DeviceFormData>(emptyForm);
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceFormData>(emptyMaintenanceForm);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ─── Build query params ───
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", pageSize.toString());
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (areaFilter !== "all") params.set("areaId", areaFilter);
    if (tagFilter !== "all") params.set("tag", tagFilter);
    return params.toString();
  }, [search, statusFilter, typeFilter, areaFilter, tagFilter, page, pageSize]);

  // ─── Queries ───
  const { data, isLoading, dataUpdatedAt } = useQuery<{
    items: Device[];
    total: number;
    page: number;
    totalPages: number;
    statusCounts: Record<string, number>;
  }>({
    queryKey: ["devices", queryParams],
    queryFn: () => apiFetch(`/api/devices?${queryParams}`),
    refetchInterval: refreshInterval || false,
  });

  const lastRefreshed = data ? new Date(dataUpdatedAt) : null;

  const { data: areas } = useQuery<{ items: { id: string; name: string }[]; total: number }>({
    queryKey: ["areas-list"],
    queryFn: () => apiFetch("/api/areas?limit=100"),
  });

  // Compute all available tags from current items
  const deviceItems = data?.items;
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    (deviceItems || []).forEach((d) => {
      parseTags(d.tags).forEach((t) => tagSet.add(t));
    });
    return Array.from(tagSet).sort();
  }, [deviceItems]);

  const { data: deviceDetail, isLoading: detailLoading, error: detailError, isError: detailIsError } = useQuery<{ device: Device; inMaintenance?: boolean }>({
    queryKey: ["device-detail", selectedId],
    queryFn: () => apiFetch(`/api/devices/${selectedId}`),
    enabled: !!selectedId && detailOpen,
  });

  // ─── Mutations ───
  const createMutation = useMutation({
    mutationFn: (data: DeviceFormData) =>
      apiFetch("/api/devices", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Device created successfully");
      setAddOpen(false);
      const newDevice = res.device;
      if (newDevice?.id) {
        setSelectedId(newDevice.id);
        setDetailOpen(true);
      }
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["all-devices-parent"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/api/devices/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Device updated successfully");
      setEditOpen(false);
      setForm(emptyForm);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["device-detail", selectedId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/devices/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Device deleted successfully");
      setDeleteOpen(false);
      setSelectedId(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedId!);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const rebootMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ device?: Device; reboot?: { statusUpdated: boolean; directAccess: boolean; message: string } }>(`/api/devices/${id}`, { method: "PUT", body: JSON.stringify({ status: "MAINTENANCE" }) }),
    onSuccess: (res) => {
      if (res.reboot) {
        if (res.reboot.directAccess) {
          toast.success("Reboot command sent", { description: res.reboot.message });
        } else {
          toast.warning("Status updated only", { description: res.reboot.message });
        }
      } else {
        toast.success("Device status updated to MAINTENANCE");
      }
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["device-detail", selectedId] });
    },
  });

  const bulkRebootMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch("/api/devices/bulk", { method: "POST", body: JSON.stringify({ action: "reboot", ids }) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Bulk reboot completed");
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch("/api/devices/bulk", { method: "POST", body: JSON.stringify({ action: "delete", ids }) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(res.message || "Bulk delete completed");
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const scheduleMaintenanceMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: MaintenanceFormData }) =>
      apiFetch(`/api/devices/${id}`, { method: "PUT", body: JSON.stringify({ ...data, status: "MAINTENANCE" }) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success("Maintenance scheduled successfully");
      setMaintenanceOpen(false);
      setMaintenanceForm(emptyMaintenanceForm);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ["device-detail", selectedId] });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: ({ ip, port, username, password }: { ip: string; port: number; username: string; password: string }) =>
      apiFetch("/api/devices/test-connection", { method: "POST", body: JSON.stringify({ ip, port, username, password }) }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success("Connection successful!", { description: res.message });
      } else {
        toast.error("Connection failed", { description: res.message });
      }
    },
    onError: () => toast.error("Failed to test connection"),
  });

  // All devices query for parent dropdown
  const { data: allDevices } = useQuery<{ items: Device[] }>({
    queryKey: ["all-devices-parent"],
    queryFn: () => apiFetch("/api/devices?limit=500"),
  });

  // ─── Selection Logic ───
  const allItemsSelected = (data?.items?.length ?? 0) > 0 && data?.items?.every((d) => selectedIds.has(d.id));
  const someItemsSelected = data?.items?.some((d) => selectedIds.has(d.id));

  function toggleSelectAll() {
    if (allItemsSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data?.items.map((d) => d.id) || []));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─── Validation ───
  function validateForm(f: DeviceFormData): boolean {
    const errors: string[] = [];
    if (!f.name.trim()) errors.push("Device name is required");
    if (!f.ipAddress.trim()) errors.push("IP address is required");
    else if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(f.ipAddress.trim())) errors.push("Invalid IP address format");
    if (f.port < 1 || f.port > 65535) errors.push("Port must be between 1 and 65535");
    if (f.apiPort < 1 || f.apiPort > 65535) errors.push("API port must be between 1 and 65535");
    setFormErrors(errors);
    return errors.length === 0;
  }

  // ─── Handlers ───
  function openEdit(d: Device) {
    setSelectedId(d.id);
    setForm({
      name: d.name, type: d.type, vendor: d.vendor, model: d.model,
      ipAddress: d.ipAddress, port: d.port, apiPort: d.apiPort,
      username: d.username, password: d.password,
      monitorProtocol: d.monitorProtocol || "SNMP",
      snmpCommunity: d.snmpCommunity || "public",
      snmpVersion: d.snmpVersion || "2c",
      snmpPort: d.snmpPort || 161,
      snmpv3User: (d as any).snmpv3User || "",
      snmpv3AuthProto: (d as any).snmpv3AuthProto || "MD5",
      snmpv3PrivProto: (d as any).snmpv3PrivProto || "DES",
      snmpv3AuthKey: (d as any).snmpv3AuthKey || "",
      snmpv3PrivKey: (d as any).snmpv3PrivKey || "",
      location: d.location, areaId: d.area?.id || "", tags: d.tags || "[]",
      parentId: d.parent?.id || "", autoBackup: d.autoBackup,
    });
    setFormErrors([]);
    setEditOpen(true);
  }

  function openDetail(id: string) {
    setSelectedId(id);
    setDetailOpen(true);
  }

  function openDelete(id: string) {
    setSelectedId(id);
    setDeleteOpen(true);
  }

  function openMaintenance(id: string) {
    setSelectedId(id);
    setMaintenanceForm(emptyMaintenanceForm);
    setMaintenanceOpen(true);
  }

  // Reset page when filters change
  function handleFilterChange(updater: (value: string) => void) {
    return (value: string) => {
      updater(value);
      setPage(1);
    };
  }

  // ─── Export CSV ───
  function handleExport() {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (areaFilter !== "all") params.set("areaId", areaFilter);
    if (tagFilter !== "all") params.set("tag", tagFilter);
    if (search) params.set("search", search);
    window.open(`/api/devices/export?${params.toString()}`, "_blank");
    toast.success("Export started");
  }

  // ─── Import CSV ───
  function handleDownloadTemplate() {
    const csvContent = `name,ipaddress,type,vendor,model,port,apiport,username,password,monitorprotocol,snmpcommunity,snmpversion,snmpport,location,area,tags,autobackup
Core Router 1,192.168.1.1,ROUTER,MIKROTIK,CCR2004-1G-12S+2XS,22,8728,admin,,SNMP,public,2c,161,Data Center Rack 3,,core;production,true
Distribution Switch,192.168.1.2,SWITCH,CISCO,Catalyst 2960,22,22,admin,,SNMP,public,2c,161,Floor 2 Rack 1,,switch;floor2,false
Access OLT,192.168.1.3,OLT,VSOL,V2802RH,23,8080,admin,,SNMP_V3,,,,Block A Roof,,olt;gpon,true
Wireless AP,192.168.1.4,AP,UBIQUITI,UniFi 6 Lite,22,443,ubnt,,API,,,,Lobby Area,,ap;wifi,false`;
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "devices_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  }

  const handleImportCSV = async () => {
    const fileInput = importFileInputRef.current;
    if (!fileInput || !fileInput.files?.[0]) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", fileInput.files[0]);
      const res = await fetch("/api/devices/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const result = await res.json();
      if (res.ok) {
        const parts = [`Imported ${result.created} device${result.created !== 1 ? "s" : ""}`];
        if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
        if (result.errors?.length) parts.push(`${result.errors.length} row warning${result.errors.length !== 1 ? "s" : ""}`);
        toast.success(parts.join(" · "));
        if (result.skippedDetails?.length) {
          // logger: import skipped details
        }
        queryClient.invalidateQueries({ queryKey: ["devices"] });
        queryClient.invalidateQueries({ queryKey: ["all-devices-parent"] });
        setShowImportDialog(false);
      } else {
        toast.error(result.error || "Import failed");
        if (result.details?.length) {
          // logger: import error details
        }
      }
    } catch {
      toast.error("Import failed — network error");
    }
    setImporting(false);
    if (fileInput) fileInput.value = "";
    setSelectedFileName("");
    setHasFile(false);
  };

  // ─── Pagination ───
  const totalDevices = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const startItem = totalDevices === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalDevices);

  // Generate page numbers to display
  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push(-1); // ellipsis
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push(-2); // ellipsis
      pages.push(totalPages);
    }
    return pages;
  }, [page, totalPages]);

  // Areas list
  const areasList = areas?.items || [];
  const statusCounts = data?.statusCounts || {};

  // ─── Loading ───
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-40" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="skeleton-wave h-20 rounded-lg" />
        <Skeleton className="skeleton-wave h-96 rounded-lg" />
      </div>
    );
  }

  const maintenanceDevices = (data?.items || []).filter((d) => d.status === "MAINTENANCE");

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Network Devices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage routers, switches, OLTs and all network infrastructure.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-1.5" />Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />Export CSV
          </Button>
          <Button onClick={() => { setForm(emptyForm); setFormErrors([]); setAddOpen(true); }} className="bg-red-600 hover:bg-red-700 text-white">
            <Plus className="h-4 w-4 mr-2" />Add Device
          </Button>
        </div>
      </div>

      {/* Stats Cards — Dashboard style */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-sm"><Server className="h-3.5 w-3.5" /></div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Devices</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{statusCounts["ONLINE"] + statusCounts["OFFLINE"] + statusCounts["WARNING"] + statusCounts["UNKNOWN"] + statusCounts["MAINTENANCE"] || 0}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm hover:shadow-md hover:border-green-200 dark:hover:border-green-800/50 transition-all duration-200 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-sm"><Activity className="h-3.5 w-3.5" /></div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Online</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">{statusCounts["ONLINE"] || 0}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-sm"><Server className="h-3.5 w-3.5" /></div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Offline</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{statusCounts["OFFLINE"] || 0}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm hover:shadow-md hover:border-amber-200 dark:hover:border-amber-800/50 transition-all duration-200 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-sm"><Thermometer className="h-3.5 w-3.5" /></div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Warning</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{statusCounts["WARNING"] || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Maintenance Mode Banner */}
      {maintenanceDevices.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {maintenanceDevices.length} device{maintenanceDevices.length > 1 ? "s" : ""} in maintenance mode
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 truncate">
              {maintenanceDevices.map((d) => d.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name, IP, model..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={handleFilterChange(setStatusFilter)}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="OFFLINE">Offline</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="UNKNOWN">Unknown</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={handleFilterChange(setTypeFilter)}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Device Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {DEVICE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={areaFilter} onValueChange={handleFilterChange(setAreaFilter)}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Area" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Areas</SelectItem>
                  {areasList.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {allTags.length > 0 && (
                <Select value={tagFilter} onValueChange={handleFilterChange(setTagFilter)}>
                  <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Tags" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tags</SelectItem>
                    {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            {/* Toolbar row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Auto-refresh */}
                <div className="flex items-center gap-2">
                  <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                  <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
                    <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REFRESH_OPTIONS.map((opt) => <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {lastRefreshed && refreshInterval > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Last: {lastRefreshed.toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Showing {startItem} to {endItem} of {totalDevices} devices
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 border rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} device(s) selected</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => bulkRebootMutation.mutate(Array.from(selectedIds))} disabled={bulkRebootMutation.isPending}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Bulk Reboot
          </Button>
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setBulkDeleteOpen(true)} disabled={bulkDeleteMutation.isPending}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Bulk Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      )}

      {/* Device Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-10">
                    <Checkbox
                      checked={allItemsSelected}
                      ref={(el) => {
                        if (el) el.dataset.state = allItemsSelected ? "checked" : someItemsSelected ? "indeterminate" : "unchecked";
                      }}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all devices"
                    />
                  </TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Device Name</TableHead>
                  <TableHead className="text-xs">Type / Vendor</TableHead>
                  <TableHead className="text-xs">IP Address</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Location</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">CPU / MEM</TableHead>
                  <TableHead className="text-xs hidden xl:table-cell">Last Seen</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data?.items || data.items.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {search || statusFilter !== "all" || typeFilter !== "all" || areaFilter !== "all" || tagFilter !== "all"
                        ? "No devices match your filters"
                        : "No devices found. Click Add Device to create one."}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((device) => {
                    const sc = STATUS_CONFIG[device.status] || STATUS_CONFIG.UNKNOWN;
                    const lastSeen = formatRelativeTime(device.lastSeenAt);
                    const tags = parseTags(device.tags);
                    const isChild = !!device.parent;
                    const depth = device.parent?.name ? 1 : 0;
                    const isInMaintenance = device.status === "MAINTENANCE";
                    return (
                      <TableRow key={device.id} className={`cursor-pointer hover:bg-muted/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${device.status === 'ONLINE' ? 'border-l-[3px] border-l-green-500' : device.status === 'OFFLINE' ? 'border-l-[3px] border-l-red-500' : device.status === 'WARNING' ? 'border-l-[3px] border-l-amber-500' : device.status === 'MAINTENANCE' ? 'border-l-[3px] border-l-yellow-500' : ''} ${isChild ? "bg-amber-50/20 dark:bg-amber-950/10" : ""}`} onClick={() => openDetail(device.id)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(device.id)}
                            onCheckedChange={() => toggleSelect(device.id)}
                            aria-label={`Select ${device.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${device.status === 'ONLINE' ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' : device.status === 'OFFLINE' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' : device.status === 'WARNING' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : device.status === 'MAINTENANCE' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sc.dotClass} ${device.status === 'OFFLINE' ? 'animate-pulse' : ''}`} />
                            {sc.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2" style={{ paddingLeft: `${depth * 24}px` }}>
                            {(() => { const Icon = getDeviceTypeIcon(device.type); return <div className={`p-1.5 rounded-md shrink-0 mt-0.5 ${DeviceTypeColorMap[device.type] || 'bg-gray-100 text-gray-600'}`}><Icon className="h-4 w-4" /></div>; })()}
                            <div className="min-w-0">
                              <div className="font-medium text-sm">{device.name}</div>
                              <div className="text-xs text-muted-foreground">{device.model || "No model"}</div>
                              {device.parent && <Badge variant="outline" className="text-[9px] mt-0.5 w-fit rounded-full px-2 py-0"><Network className="h-2.5 w-2.5 mr-0.5" />{device.parent.name}</Badge>}
                              {isInMaintenance && device.maintenanceEnd && (
                                <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                  <CalendarClock className="h-3 w-3" />
                                  Until {new Date(device.maintenanceEnd).toLocaleString()}
                                </div>
                              )}
                              {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {tags.slice(0, 2).map((t) => (
                                    <span key={t} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                      <Tag className="h-2.5 w-2.5 mr-0.5" />{t}
                                    </span>
                                  ))}
                                  {tags.length > 2 && (
                                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                      +{tags.length - 2}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">{DEVICE_TYPES.find((t) => t.value === device.type)?.label || device.type}</div>
                          <div className="text-xs text-muted-foreground">{VENDORS.find((v) => v.value === device.vendor)?.label || device.vendor}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{device.ipAddress}:{device.port}</TableCell>
                        <TableCell className="text-xs hidden lg:table-cell">
                          {device.location ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{device.location}</span> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {device.status === "ONLINE" ? (
                            <div className="space-y-1.5 min-w-[80px]">
                              <div>
                                <div className="flex items-center gap-1.5 text-xs">
                                  <Cpu className={`h-3 w-3 shrink-0 ${device.cpuUsage > 80 ? "text-red-500" : device.cpuUsage >= 50 ? "text-amber-500" : "text-muted-foreground"}`} />
                                  <span className={`font-medium tabular-nums ${device.cpuUsage > 80 ? "text-red-600" : device.cpuUsage >= 50 ? "text-amber-600" : ""}`}>{device.cpuUsage}%</span>
                                  <span className="text-[10px] text-muted-foreground">CPU</span>
                                </div>
                                <MiniProgressBar value={device.cpuUsage} />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 text-xs">
                                  <MemoryStick className={`h-3 w-3 shrink-0 ${device.memoryUsage > 80 ? "text-red-500" : device.memoryUsage >= 50 ? "text-amber-500" : "text-muted-foreground"}`} />
                                  <span className={`font-medium tabular-nums ${device.memoryUsage > 80 ? "text-red-600" : device.memoryUsage >= 50 ? "text-amber-600" : ""}`}>{device.memoryUsage}%</span>
                                  <span className="text-[10px] text-muted-foreground">MEM</span>
                                </div>
                                <MiniProgressBar value={device.memoryUsage} />
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground italic text-center py-1">
                              <AlertTriangle className="h-3 w-3 mx-auto mb-0.5 text-amber-500" />
                              No data
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <span className={`text-xs ${lastSeen.colorClass}`}>{lastSeen.text}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(device.id)} title="View"><Eye className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openMaintenance(device.id)} title="Schedule Maintenance"><CalendarClock className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(device)} title="Edit"><Edit className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => openDelete(device.id)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalDevices > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Per page:</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="w-16 h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {pageNumbers.map((pn, idx) => (
                  pn < 0 ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground text-sm">...</span>
                  ) : (
                    <Button
                      key={pn}
                      variant={pn === page ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8 text-xs"
                      onClick={() => setPage(pn)}
                    >
                      {pn}
                    </Button>
                  )
                ))}
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Add Device Dialog ─── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Network Device</DialogTitle>
            <DialogDescription>Configure a new network device to monitor.</DialogDescription>
          </DialogHeader>
          {formErrors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              {formErrors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>)}
            </div>
          )}
          <DeviceFormContent
            form={form}
            setForm={setForm}
            areasList={areasList}
            allDevices={allDevices?.items || []}
            selectedId={selectedId}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => testConnectionMutation.mutate({ ip: form.ipAddress, port: form.port, username: form.username, password: form.password })} disabled={testConnectionMutation.isPending || !form.ipAddress}>
              <Zap className="h-3.5 w-3.5 mr-1.5" />{testConnectionMutation.isPending ? "Testing..." : "Test Connection"}
            </Button>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={createMutation.isPending} onClick={() => { if (validateForm(form)) createMutation.mutate(form); }}>
              {createMutation.isPending ? "Creating..." : "Create Device"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Device Dialog ─── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Device</DialogTitle>
            <DialogDescription>Update device configuration.</DialogDescription>
          </DialogHeader>
          {formErrors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              {formErrors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>)}
            </div>
          )}
          <DeviceFormContent
            form={form}
            setForm={setForm}
            areasList={areasList}
            allDevices={allDevices?.items || []}
            selectedId={selectedId}
            isEdit
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => testConnectionMutation.mutate({ ip: form.ipAddress, port: form.port, username: form.username, password: form.password })} disabled={testConnectionMutation.isPending || !form.ipAddress}>
              <Zap className="h-3.5 w-3.5 mr-1.5" />{testConnectionMutation.isPending ? "Testing..." : "Test Connection"}
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={updateMutation.isPending} onClick={() => { if (validateForm(form) && selectedId) updateMutation.mutate({ id: selectedId, data: form as unknown as Record<string, unknown> }); }}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Schedule Maintenance Dialog ─── */}
      <Dialog open={maintenanceOpen} onOpenChange={setMaintenanceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Maintenance</DialogTitle>
            <DialogDescription>Set a maintenance window for this device. It will show as MAINTENANCE status during this period.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Start Date/Time</Label>
              <Input
                type="datetime-local"
                value={maintenanceForm.maintenanceStart}
                onChange={(e) => setMaintenanceForm({ ...maintenanceForm, maintenanceStart: e.target.value })}
              />
            </div>
            <div>
              <Label>End Date/Time</Label>
              <Input
                type="datetime-local"
                value={maintenanceForm.maintenanceEnd}
                onChange={(e) => setMaintenanceForm({ ...maintenanceForm, maintenanceEnd: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={maintenanceForm.maintenanceNote}
                onChange={(e) => setMaintenanceForm({ ...maintenanceForm, maintenanceNote: e.target.value })}
                placeholder="e.g. Firmware upgrade, hardware replacement"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMaintenanceOpen(false); setMaintenanceForm(emptyMaintenanceForm); }}>Cancel</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              disabled={scheduleMaintenanceMutation.isPending || !maintenanceForm.maintenanceStart || !maintenanceForm.maintenanceEnd}
              onClick={() => { if (selectedId) scheduleMaintenanceMutation.mutate({ id: selectedId, data: maintenanceForm }); }}
            >
              {scheduleMaintenanceMutation.isPending ? "Scheduling..." : "Schedule Maintenance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Device Detail Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" a11yTitle="Device Details">
          {detailLoading ? (
            <div className="space-y-4 py-6"><Skeleton className="skeleton-wave h-6 w-48" /><Skeleton className="skeleton-wave h-40 w-full" /><Skeleton className="skeleton-wave h-40 w-full" /></div>
          ) : detailIsError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <div className="p-3 rounded-full bg-red-100 dark:bg-red-950/30"><AlertTriangle className="h-6 w-6 text-red-500" /></div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Failed to load device details</p>
              <p className="text-xs text-muted-foreground max-w-xs">{detailError?.message || "An unexpected error occurred. Please try again."}</p>
              <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["device-detail", selectedId] })}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Retry</Button>
            </div>
          ) : deviceDetail ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[deviceDetail.device.status]?.dotClass || "bg-gray-400"}`} />
                    <DialogTitle>{deviceDetail.device.name}</DialogTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">{deviceDetail.device.type} / {deviceDetail.device.vendor}</Badge>
                  {parseTags(deviceDetail.device.tags).map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px]"><Tag className="h-2.5 w-2.5 mr-0.5" />{t}</Badge>
                  ))}
                </div>
                <DialogDescription>{deviceDetail.device.ipAddress}:{deviceDetail.device.port} &middot; {deviceDetail.device.model || "No model"} {deviceDetail.device.area ? `· ${deviceDetail.device.area.name}` : ""}</DialogDescription>
              </DialogHeader>

              {/* Maintenance banner */}
              {(deviceDetail.inMaintenance || deviceDetail.device.status === "MAINTENANCE") && deviceDetail.device.maintenanceEnd && (
                <div className="flex items-center gap-2 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 p-3">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <div className="text-xs">
                    <span className="font-medium text-orange-700 dark:text-orange-400">Maintenance Window</span>
                    <span className="text-orange-600 dark:text-orange-400 ml-2">
                      Until {new Date(deviceDetail.device.maintenanceEnd).toLocaleString()}
                    </span>
                    {deviceDetail.device.maintenanceNote && (
                      <span className="text-orange-500 ml-2">— {deviceDetail.device.maintenanceNote}</span>
                    )}
                  </div>
                </div>
              )}

              {/* System Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {deviceDetail.device.status === "ONLINE" ? (
                  <>
                    <div className="rounded-lg border p-3 text-center">
                      <Cpu className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-lg font-bold tabular-nums">{deviceDetail.device.cpuUsage}%</p>
                      <p className="text-xs text-muted-foreground">CPU</p>
                      <Progress value={deviceDetail.device.cpuUsage} className="mt-1.5 h-1.5" />
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <MemoryStick className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-lg font-bold tabular-nums">{deviceDetail.device.memoryUsage}%</p>
                      <p className="text-xs text-muted-foreground">Memory</p>
                      <Progress value={deviceDetail.device.memoryUsage} className="mt-1.5 h-1.5" />
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <Thermometer className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-lg font-bold tabular-nums">{deviceDetail.device.temperature != null ? `${deviceDetail.device.temperature}°C` : "N/A"}</p>
                      <p className="text-xs text-muted-foreground">Temperature</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-lg font-bold tabular-nums">{formatUptime(deviceDetail.device.uptimeSeconds)}</p>
                      <p className="text-xs text-muted-foreground">Uptime</p>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 md:col-span-4 rounded-lg border border-dashed p-4 text-center">
                    <AlertTriangle className="h-5 w-5 mx-auto mb-1.5 text-amber-500" />
                    <p className="text-sm font-medium text-muted-foreground">Monitoring Unavailable</p>
                    <p className="text-xs text-muted-foreground mt-0.5">CPU, Memory, Temperature &amp; Uptime data is only available when the device is <span className="text-green-600 font-medium">Online</span> and reachable by the monitoring service.</p>
                  </div>
                )}
              </div>

              {/* Last Seen */}
              {deviceDetail.device.lastSeenAt && (
                <div className="text-xs text-muted-foreground">
                  Last seen: <span className={formatRelativeTime(deviceDetail.device.lastSeenAt).colorClass}>{formatRelativeTime(deviceDetail.device.lastSeenAt).text}</span>
                </div>
              )}

              {/* Parent / Children Hierarchy */}
              {(deviceDetail.device.parent || (deviceDetail.device.children && deviceDetail.device.children.length > 0)) && (
                <div className="rounded-lg border p-3 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Network className="h-3.5 w-3.5" />Device Hierarchy</h4>
                  {deviceDetail.device.parent && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Parent:</span>
                      <button
                        className="text-primary hover:underline font-medium flex items-center gap-1"
                        onClick={(e) => { e.stopPropagation(); setDetailOpen(false); openDetail(deviceDetail.device.parent!.id); }}
                      >
                        <Network className="h-3 w-3" />
                        {deviceDetail.device.parent.name}
                        <span className="text-xs text-muted-foreground font-normal">({deviceDetail.device.parent.ipAddress})</span>
                      </button>
                    </div>
                  )}
                  {deviceDetail.device.children && deviceDetail.device.children.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Children:</span>
                      <Badge variant="secondary" className="text-xs">{deviceDetail.device.children.length} child device{deviceDetail.device.children.length > 1 ? "s" : ""}</Badge>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {deviceDetail.device.children.slice(0, 5).map((child) => (
                          <button
                            key={child.id}
                            className="text-xs bg-muted hover:bg-accent px-2 py-0.5 rounded-md flex items-center gap-1"
                            onClick={(e) => { e.stopPropagation(); setDetailOpen(false); openDetail(child.id); }}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[child.status]?.dotClass || "bg-gray-400"}`} />
                            {child.name}
                          </button>
                        ))}
                        {deviceDetail.device.children.length > 5 && (
                          <span className="text-xs text-muted-foreground">+{deviceDetail.device.children.length - 5} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Change History */}
              {deviceDetail.device.configHistory && deviceDetail.device.configHistory.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><History className="h-4 w-4" />Configuration History <span className="text-xs font-normal text-muted-foreground">(last {Math.min(10, deviceDetail.device.configHistory.length)} changes)</span></h4>
                  <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Field</TableHead>
                          <TableHead className="text-xs">Old Value</TableHead>
                          <TableHead className="text-xs">New Value</TableHead>
                          <TableHead className="text-xs">Changed By</TableHead>
                          <TableHead className="text-xs">When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deviceDetail.device.configHistory.slice(0, 10).map((ch) => (
                          <TableRow key={ch.id}>
                            <TableCell className="text-xs font-medium">{ch.field}</TableCell>
                            <TableCell className="text-xs text-red-600 font-mono max-w-[120px] truncate">{ch.oldValue || "—"}</TableCell>
                            <TableCell className="text-xs text-green-600 font-mono max-w-[120px] truncate">{ch.newValue || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{ch.changedBy || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(ch.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={rebootMutation.isPending} onClick={() => { if (selectedId) rebootMutation.mutate(selectedId); }}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />{rebootMutation.isPending ? "Rebooting..." : "Reboot Device"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); openMaintenance(deviceDetail.device.id); }}>
                  <CalendarClock className="h-3.5 w-3.5 mr-1.5" />Schedule Maintenance
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setDetailOpen(false); openEdit(deviceDetail.device); }}>
                  <Edit className="h-3.5 w-3.5 mr-1.5" />Edit
                </Button>
              </div>

              {/* Interfaces */}
              {deviceDetail.device.interfaces.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Interfaces ({deviceDetail.device.interfaces.length})</h4>
                  <div className="rounded-lg border overflow-hidden max-h-48 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead className="text-xs">Name</TableHead><TableHead className="text-xs">Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {deviceDetail.device.interfaces.map((iface) => (
                          <TableRow key={iface.id}>
                            <TableCell className="text-xs font-mono">{iface.name}</TableCell>
                            <TableCell>
                              <Badge variant={iface.status === "UP" ? "default" : "secondary"} className="text-[10px]">{iface.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* OLT Ports */}
              {deviceDetail.device.oltPorts && deviceDetail.device.oltPorts.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">PON Ports ({deviceDetail.device.oltPorts.length})</h4>
                  <div className="rounded-lg border overflow-hidden max-h-48 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead className="text-xs">Port</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs">TX/RX Power</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {deviceDetail.device.oltPorts.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs font-mono">PON {p.portNumber}</TableCell>
                            <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"} className="text-[10px]">{p.status}</Badge></TableCell>
                            <TableCell className="text-xs">{p.subscriber?.name || "—"}</TableCell>
                            <TableCell className="text-xs font-mono">
                              {p.txPower != null && p.rxPower != null ? `${p.txPower.toFixed(1)} / ${p.rxPower.toFixed(1)} dBm` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Bandwidth Logs */}
              {deviceDetail.device.bandwidthLogs && deviceDetail.device.bandwidthLogs.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Recent Bandwidth</h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {deviceDetail.device.bandwidthLogs.slice(0, 5).map((log, i) => (
                      <div key={i} className="flex items-center justify-between text-xs border rounded px-3 py-2">
                        <span className="text-muted-foreground">{log.interfaceName || "—"}</span>
                        <div className="flex items-center gap-3 tabular-nums">
                          <span className="text-green-600">↓ {formatBytes(log.downloadBps)}</span>
                          <span className="text-emerald-600">↑ {formatBytes(log.uploadBps)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm ─── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Device</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All associated data including interfaces, bandwidth logs, and OLT ports will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (selectedId) deleteMutation.mutate(selectedId); }}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Bulk Delete Confirm ─── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Device(s)</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All selected devices and their associated data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}>
              {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedIds.size} Device(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Import CSV Dialog ─── */}
      <Dialog open={showImportDialog} onOpenChange={() => setShowImportDialog(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-red-500" />
              Import Devices from CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk-create network devices. All imported devices will be set to UNKNOWN status initially.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* File Upload Area */}
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center hover:border-red-300 transition-colors cursor-pointer"
              onClick={() => importFileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to select a CSV file</p>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setSelectedFileName(file?.name || "");
                  setHasFile(!!file);
                }}
              />
              <Button variant="outline" size="sm" className="mt-3" onClick={(e) => { e.stopPropagation(); importFileInputRef.current?.click(); }}>
                Choose File
              </Button>
              {selectedFileName && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {selectedFileName}
                </p>
              )}
            </div>

            {/* CSV Format Info */}
            <div className="bg-muted/50 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">CSV Format:</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={handleDownloadTemplate}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Download Template
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Required columns:</p>
                <code className="block bg-background rounded px-1 py-0.5">name, ipaddress</code>
                <p className="font-medium text-foreground mt-1.5">Optional columns:</p>
                <code className="block bg-background rounded px-1 py-0.5">type, vendor, model, port, apiport, username, password, monitorprotocol, snmpcommunity, snmpversion, snmpport, location, area, tags, autobackup</code>
              </div>
              <div className="border-t pt-2 mt-2">
                <p className="text-[10px] font-medium text-foreground mb-1">Valid values:</p>
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <p><span className="font-medium">type:</span> ROUTER, SWITCH, AP, OLT, ONU, SERVER, FIREWALL, GATEWAY, BRIDGE, WIRELESS_BRIDGE, OTHER</p>
                  <p><span className="font-medium">vendor:</span> MIKROTIK, CISCO, JUNIPER, HUAWEI, ZTE, VSOL, BDCOM, UBIQUITI, TP_LINK, ARUBA, FORTINET, OTHER</p>
                  <p><span className="font-medium">monitorprotocol:</span> SNMP, SNMP_V3, API, SSH, TELNET, HTTP</p>
                  <p><span className="font-medium">tags:</span> Semicolon-separated (e.g. core;production)</p>
                  <p><span className="font-medium">area:</span> Area name (auto-matched by partial name)</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImportCSV}
              disabled={importing || !hasFile}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {importing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1.5" />
                  Import Devices
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
