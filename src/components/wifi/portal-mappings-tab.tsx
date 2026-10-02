'use client';

/**
 * Pool Mappings Tab — Bridges IP Pools (IpPool table) with Portal Instances.
 *
 * Displays every IP Pool from the IP Pool Management table and shows which
 * captive portal it is mapped to via the PortalMapping table. Users can
 * create, edit, and delete these pool-to-portal mappings.
 *
 * Data Sources:
 *   IP Pools:   GET /api/wifi/ip-pools         → IpPool table
 *   Portals:    GET /api/wifi/portal/instances   → CaptivePortal table
 *   Mappings:   GET /api/wifi/portal/mappings    → PortalMapping table
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowRightLeft,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  RefreshCw,
  Search,
  Info,
  Wifi,
  Network,
  Globe,
  Monitor,
  Server,
  Users,
  Unplug,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PropertySelector } from '@/components/common/property-selector';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface IpPoolEntry {
  id: string;
  name: string;
  description: string | null;
  gateway: string | null;
  subnet: string | null;
  isDefault: boolean;
  captivePortal: boolean;
  enabled: boolean;
  _count: { plans: number; users: number; ranges: number };
  ranges: Array<{ startIp: string; endIp: string; comment?: string }>;
}

interface PortalMappingEntry {
  id: string;
  partnerId: string;
  portalId: string;
  ipPoolId: string | null;
  vlanId: number | null;
  ssid: string | null;
  subnet: string | null;
  priority: number;
  enabled: boolean;
  captivePortal?: { id: string; name: string } | null;
}

interface PortalOption {
  id: string;
  name: string;
}

interface PoolWithMapping {
  pool: IpPoolEntry;
  mapping: PortalMappingEntry | null;
}

interface MappingForm {
  portalId: string;
  vlanId: string;
  ssid: string;
  priority: number;
  enabled: boolean;
}

const EMPTY_FORM: MappingForm = {
  portalId: '',
  vlanId: '',
  ssid: '',
  priority: 0,
  enabled: true,
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Display-only: strips /32 for cleaner table rendering */
function formatInet(val: string | null | undefined): string {
  if (!val) return '';
  return val.replace(/\/32$/, '');
}

/**
 * Ensure a subnet value is valid CIDR (always includes /bits).
 * PostgreSQL inet columns return values like "10.0.0.0/24" or "10.0.0.5/32".
 * This must be preserved as-is for the resolve-zone API's CIDR matching.
 */
function ensureCidr(val: string | null | undefined): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  // Already has CIDR notation (e.g. 10.0.0.0/24)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(trimmed)) return trimmed;
  // Plain IPv4 (e.g. 10.0.0.0) → treat as /32
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return `${trimmed}/32`;
  return null;
}

function countTotalIps(ranges: Array<{ startIp: string; endIp: string }>): number {
  return ranges.reduce((sum, r) => {
    if (!r.startIp || !r.endIp) return sum;
    try {
      const s = r.startIp.replace(/\/\d+$/, '').split('.').reduce((a, o) => (a << 8) + parseInt(o), 0) >>> 0;
      const e = r.endIp.replace(/\/\d+$/, '').split('.').reduce((a, o) => (a << 8) + parseInt(o), 0) >>> 0;
      return sum + Math.max(0, e - s + 1);
    } catch { return sum; }
  }, 0);
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function PortalMappingsTab() {
  const { toast } = useToast();
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const partnerId = propertyFilter !== 'all' ? propertyFilter : undefined;
  const [pools, setPools] = useState<IpPoolEntry[]>([]);
  const [portals, setPortals] = useState<PortalOption[]>([]);
  const [mappings, setMappings] = useState<PortalMappingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<PortalMappingEntry | null>(null);
  const [editingPool, setEditingPool] = useState<IpPoolEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<MappingForm>({ ...EMPTY_FORM });

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [poolsRes, portalsRes, mappingsRes] = await Promise.all([
        fetch('/api/wifi/ip-pools'),
        fetch('/api/wifi/portal/instances'),
        fetch(`/api/wifi/portal/mappings${partnerId ? `${partnerId ? `?partnerId=${partnerId}` : ''}` : ''}`),
      ]);

      if (!poolsRes.ok) { toast({ title: 'Request Failed', description: `Failed to fetch IP pools (${poolsRes.status})`, variant: 'destructive' }); return; }
      if (!portalsRes.ok) { toast({ title: 'Request Failed', description: `Failed to fetch portals (${portalsRes.status})`, variant: 'destructive' }); return; }
      if (!mappingsRes.ok) { toast({ title: 'Request Failed', description: `Failed to fetch mappings (${mappingsRes.status})`, variant: 'destructive' }); return; }

      const poolsData = await poolsRes.json();
      const portalsData = await portalsRes.json();
      const mappingsData = await mappingsRes.json();

      if (poolsData.success && Array.isArray(poolsData.data)) {
        setPools(poolsData.data);
      }
      if (portalsData.success && Array.isArray(portalsData.data)) {
        setPortals(portalsData.data.map((p: any) => ({ id: p.id, name: p.name })));
      }
      if (mappingsData.success && Array.isArray(mappingsData.data)) {
        setMappings(mappingsData.data);
      }
    } catch (error) {
      console.error('Failed to fetch pool mappings data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [partnerId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Join Pools + Mappings ──────────────────────────────────────────────────
  // Primary match: ipPoolId (direct FK, most reliable)
  // Fallback match: subnet string comparison (for legacy mappings without ipPoolId)

  // ── Join Pools + Mappings ──
  // Each pool can only have ONE active mapping. When creating a new mapping,
  // the server auto-deletes any existing mapping for the same pool.
  // If somehow duplicates exist (legacy bug), show the most recently updated one.
  const joined: PoolWithMapping[] = pools.map(pool => {
    const poolMappings = mappings.filter(m => {
      // Primary: direct ipPoolId match (created by updated UI)
      if (m.ipPoolId && m.ipPoolId === pool.id) return true;
      // Fallback: subnet match (for legacy mappings created before ipPoolId was added)
      if (m.subnet && pool.subnet &&
          m.subnet.replace(/\/32$/, '') === pool.subnet.replace(/\/32$/, '')) return true;
      return false;
    });
    // Pick the most recently created/updated mapping if duplicates exist
    const mapping = poolMappings.sort((a, b) => {
      // Prefer enabled over disabled
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return 0; // keep DB order (already sorted by priority DESC, createdAt DESC)
    })[0] || null;
    return { pool, mapping };
  });

  // ─── Filtering ──────────────────────────────────────────────────────────────

  const filtered = joined.filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.pool.name.toLowerCase().includes(q) ||
      (item.pool.description || '').toLowerCase().includes(q) ||
      (item.pool.subnet || '').toLowerCase().includes(q) ||
      (item.mapping?.captivePortal?.name || '').toLowerCase().includes(q) ||
      (item.mapping?.ssid || '').toLowerCase().includes(q)
    );
  });

  const mappedCount = joined.filter(i => i.mapping).length;
  const unmappedCount = joined.length - mappedCount;

  // ─── Form Helpers ───────────────────────────────────────────────────────────

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditingMapping(null);
    setEditingPool(null);
  };

  const openCreate = (pool: IpPoolEntry) => {
    resetForm();
    setEditingPool(pool);
    // Pre-fill from pool data
    setForm(prev => ({
      ...prev,
      ssid: '',
      vlanId: '',
    }));
    setDialogOpen(true);
  };

  const openEdit = (item: PoolWithMapping) => {
    resetForm();
    setEditingPool(item.pool);
    if (item.mapping) {
      setEditingMapping(item.mapping);
      setForm({
        portalId: item.mapping.portalId,
        vlanId: item.mapping.vlanId !== null ? String(item.mapping.vlanId) : '',
        ssid: item.mapping.ssid || '',
        priority: item.mapping.priority,
        enabled: item.mapping.enabled,
      });
    }
    setDialogOpen(true);
  };

  // ─── CRUD Operations ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.portalId) {
      toast({ title: 'Validation Error', description: 'Please select a portal instance', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      let res: Response;
      const payload: Record<string, unknown> = {
        partnerId,
        portalId: form.portalId,
        ipPoolId: editingPool?.id || null,
        vlanId: form.vlanId ? parseInt(form.vlanId, 10) : null,
        ssid: form.ssid || null,
        subnet: ensureCidr(editingPool?.subnet),
        priority: form.priority,
        enabled: form.enabled,
      };

      if (editingMapping) {
        // ── Update existing mapping ──
        // Portal can now be changed (reassigned). Send portalId in the PUT payload.
        const { partnerId: _, ipPoolId: __, subnet: ____, ...updatePayload } = payload;
        res = await fetch(`/api/wifi/portal/mappings/${editingMapping.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });
      } else {
        // ── Create new mapping ──
        // Auto-delete any existing mappings for this pool to prevent duplicates.
        if (editingPool) {
          const existingForPool = mappings.filter(m => {
            if (m.ipPoolId && m.ipPoolId === editingPool.id) return true;
            if (m.subnet && editingPool.subnet &&
                m.subnet.replace(/\/32$/, '') === editingPool.subnet.replace(/\/32$/, '')) return true;
            return false;
          });
          if (existingForPool.length > 0) {
            // Auto-cleaning stale mappings for pool ${editingPool.id}
            for (const old of existingForPool) {
              const delRes = await fetch(`/api/wifi/portal/mappings/${old.id}`, { method: 'DELETE' });
              if (!delRes.ok) { /* non-critical auto-cleanup, ignore */ }
            }
          }
        }
        res = await fetch('/api/wifi/portal/mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) { toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' }); return; }
      const data = await res.json();
      if (data.success) {
        toast({
          title: editingMapping ? 'Mapping Updated' : 'Mapping Created',
          description: editingMapping
            ? `${editingPool?.name || 'Pool'} mapping updated`
            : `${editingPool?.name || 'Pool'} mapped to ${portals.find(p => p.id === form.portalId)?.name || 'portal'}`,
        });
        setDialogOpen(false);
        resetForm();
        fetchAll();
      } else {
        toast({
          title: 'Error',
          description: data.error?.message || 'Failed to save mapping',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Network Error', description: 'Failed to save mapping', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/wifi/portal/mappings/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) { toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' }); return; }
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Mapping Removed', description: 'Pool-to-portal mapping deleted' });
        fetchAll();
      } else {
        toast({ title: 'Error', description: data.error?.message || 'Failed to delete', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', description: 'Failed to delete mapping', variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  const handleToggle = async (item: PoolWithMapping) => {
    if (!item.mapping) return;
    try {
      const res = await fetch(`/api/wifi/portal/mappings/${item.mapping.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !item.mapping.enabled }),
      });
      if (!res.ok) { toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' }); return; }
      const data = await res.json();
      if (data.success) {
        toast({
          title: item.mapping.enabled ? 'Mapping Disabled' : 'Mapping Enabled',
        });
        fetchAll();
      } else {
        toast({ title: 'Error', description: data.error?.message || 'Failed to toggle', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', description: 'Failed to toggle mapping', variant: 'destructive' });
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Info Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/8 to-primary/3 p-4 dark:border-primary/20">
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 shrink-0 mt-0.5">
          <Info className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">IP Pool → Portal Mappings</p>
          <p className="text-xs text-muted-foreground mt-1">
            Each IP Pool from <span className="font-semibold">WiFi Access → IP Pool Management</span> is listed below.
            Map pools to captive portal instances so the RADIUS server knows which portal page to serve
            for clients in each subnet.
          </p>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Pools */}
        <div className="rounded-lg border bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-l-4 border-l-blue-500 p-4 dark:from-blue-500/5 dark:to-indigo-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Pools</p>
              <p className="text-2xl font-bold mt-1">{pools.length}</p>
            </div>
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/40">
              <Network className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>
        {/* Mapped */}
        <div className="rounded-lg border bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-l-4 border-l-emerald-500 p-4 dark:from-emerald-500/5 dark:to-green-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mapped</p>
              <p className="text-2xl font-bold mt-1">{mappedCount}</p>
            </div>
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </div>
        {/* Unmapped */}
        <div className="rounded-lg border bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-l-4 border-l-amber-500 p-4 dark:from-amber-500/5 dark:to-orange-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unmapped</p>
              <p className="text-2xl font-bold mt-1">{unmappedCount}</p>
            </div>
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Actions Row */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={isLoading}>
          <RefreshCw className={cn('h-4 w-4 mr-1.5', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by pool name, subnet, portal..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Pools Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="rounded-full bg-muted/50 p-4 mb-3">
                <Network className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-sm font-medium text-muted-foreground">
                {searchQuery ? 'No matching pools' : 'No IP pools found'}
              </h3>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Create IP pools in WiFi Access → IP Pool Management first, then map them here'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop: Table view */}
              <div className="hidden sm:block max-h-[500px] overflow-auto">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Pool</TableHead>
                      <TableHead>Subnet</TableHead>
                      <TableHead>Portal Instance</TableHead>
                      <TableHead>SSID</TableHead>
                      <TableHead className="text-center">Plans</TableHead>
                      <TableHead className="text-center">Users</TableHead>
                      <TableHead className="text-center">Mapped</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(({ pool, mapping }) => {
                      const totalIps = countTotalIps(pool.ranges || []);
                      return (
                        <TableRow key={pool.id} className={cn('hover:bg-teal-500/5 dark:hover:bg-teal-500/10 transition-colors', !pool.enabled && 'opacity-50')}>
                          {/* Pool Name */}
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[130px]">
                              <div className={cn(
                                'p-1.5 rounded-md',
                                mapping ? 'bg-primary/5 dark:bg-primary/10' : 'bg-muted'
                              )}>
                                <Network className={cn(
                                  'h-3.5 w-3.5',
                                  mapping ? 'text-primary' : 'text-muted-foreground'
                                )} />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{pool.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {pool.isDefault && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-700">
                                      Default
                                    </Badge>
                                  )}
                                  {pool.captivePortal && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 bg-primary/10 text-primary border-primary/20">
                                      <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                                      Portal
                                    </Badge>
                                  )}
                                  {!pool.enabled && (
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0">Disabled</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            {pool.description && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 ml-6 truncate max-w-[200px]">
                                {pool.description}
                              </p>
                            )}
                          </TableCell>

                          {/* Subnet */}
                          <TableCell>
                            <div className="space-y-0.5">
                              <span className="font-mono text-xs bg-muted/60 px-1.5 py-0.5 rounded">
                                {formatInet(pool.subnet) || '—'}
                              </span>
                              {totalIps > 0 && (
                                <p className="text-[10px] text-muted-foreground">{totalIps.toLocaleString()} IPs</p>
                              )}
                            </div>
                          </TableCell>

                          {/* Portal Instance (mapped) */}
                          <TableCell>
                            {mapping?.captivePortal?.name ? (
                              <div className="flex items-center gap-1.5">
                                <Monitor className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">
                                  {mapping.captivePortal.name}
                                </Badge>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <Unplug className="h-3.5 w-3.5 text-amber-500/60" />
                                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                                  Not mapped
                                </Badge>
                              </div>
                            )}
                          </TableCell>

                          {/* SSID */}
                          <TableCell>
                            {mapping?.ssid ? (
                              <div className="flex items-center gap-1">
                                <Wifi className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs font-mono">{mapping.ssid}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">&mdash;</span>
                            )}
                          </TableCell>

                          {/* Plans */}
                          <TableCell className="text-center">
                            {pool._count?.plans > 0 ? (
                              <Badge variant="outline" className="text-[10px]">
                                <Server className="h-2.5 w-2.5 mr-0.5" />
                                {pool._count.plans}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">0</span>
                            )}
                          </TableCell>

                          {/* Users */}
                          <TableCell className="text-center">
                            {pool._count?.users > 0 ? (
                              <Badge variant="outline" className="text-[10px]">
                                <Users className="h-2.5 w-2.5 mr-0.5" />
                                {pool._count.users}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">0</span>
                            )}
                          </TableCell>

                          {/* Mapped toggle */}
                          <TableCell className="text-center">
                            {mapping ? (
                              <Switch
                                checked={mapping.enabled}
                                onCheckedChange={() => handleToggle({ pool, mapping })}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">&mdash;</span>
                            )}
                          </TableCell>

                          {/* Actions */}
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {mapping ? (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => openEdit({ pool, mapping })}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(mapping.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => openCreate(pool)}
                                  className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary text-primary-foreground shadow-sm hover:shadow-md transition-all duration-200"
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Map
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </div>

              {/* Mobile: Card view */}
              <div className="sm:hidden divide-y">
                {filtered.map(({ pool, mapping }) => (
                  <div key={pool.id} className={cn('p-4 space-y-3', !pool.enabled && 'opacity-50')}>
                    {/* Header row: pool name + badge + actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn(
                          'p-1.5 rounded-md',
                          mapping ? 'bg-primary/5 dark:bg-primary/10' : 'bg-muted'
                        )}>
                          <Network className={cn(
                            'h-4 w-4',
                            mapping ? 'text-primary' : 'text-muted-foreground'
                          )} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{pool.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {mapping ? (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">
                                <Monitor className="h-2.5 w-2.5 mr-0.5" />
                                {mapping.captivePortal?.name}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                                Not mapped
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {mapping ? (
                          <>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit({ pool, mapping })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDeleteId(mapping.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" className="h-8 px-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary text-primary-foreground shadow-sm hover:shadow-md transition-all duration-200" onClick={() => openCreate(pool)}>
                            <Plus className="h-4 w-4 mr-0.5" />Map
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Subnet:</span>
                        <span className="ml-1 font-mono">{formatInet(pool.subnet) || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">SSID:</span>
                        <span className="ml-1">{mapping?.ssid || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Plans:</span>
                        <span className="ml-1">{pool._count?.plans || 0}</span>
                      </div>
                    </div>

                    {/* Bottom: toggle + VLAN */}
                    <div className="flex items-center justify-between">
          <PropertySelector value={propertyFilter} onValueChange={setPropertyFilter} />
                      <div className="flex items-center gap-2 text-xs">
                        {mapping && mapping.vlanId != null && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            <Globe className="h-2.5 w-2.5 mr-0.5" />
                            VLAN {mapping.vlanId}
                          </Badge>
                        )}
                        {pool.isDefault && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-200">Default</Badge>
                        )}
                      </div>
                      {mapping && (
                        <Switch checked={mapping.enabled} onCheckedChange={() => handleToggle({ pool, mapping })} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Mapping Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingMapping ? 'Edit Pool Mapping' : `Map "${editingPool?.name || 'Pool'}" to Portal`}
            </DialogTitle>
            <DialogDescription>
              {editingMapping
                ? `Update the mapping for ${editingPool?.name || 'this pool'}`
                : `Assign a captive portal instance to serve for ${editingPool?.name || 'this pool'}`}
            </DialogDescription>
          </DialogHeader>

          {/* Pool info summary */}
          {editingPool && (
            <div className="rounded-lg bg-muted/50 border p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Network className="h-4 w-4 text-muted-foreground" />
                {editingPool.name}
                {editingPool.isDefault && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">Default</Badge>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground ml-6">
                {editingPool.subnet && (
                  <span>Subnet: <span className="font-mono text-foreground">{formatInet(editingPool.subnet)}</span></span>
                )}
                {editingPool.gateway && (
                  <span>Gateway: <span className="font-mono text-foreground">{formatInet(editingPool.gateway)}</span></span>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 py-2">
            {/* Portal Instance Select */}
            <div className="space-y-2">
              <Label>Portal Instance *</Label>
              <Select value={form.portalId} onValueChange={(v) => setForm(prev => ({ ...prev, portalId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a portal instance" />
                </SelectTrigger>
                <SelectContent>
                  {portals.length === 0 ? (
                    <SelectItem value="_none" disabled>No portal instances available</SelectItem>
                  ) : (
                    portals.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                The captive portal to serve for clients in this pool.
                {editingMapping && ' Changing the portal will replace the existing mapping.'}
              </p>
            </div>

            {/* SSID */}
            <div className="space-y-2">
              <Label>SSID</Label>
              <Input
                value={form.ssid}
                onChange={(e) => setForm(prev => ({ ...prev, ssid: e.target.value }))}
                placeholder="e.g. Hotel_Guest, Staff_WiFi"
                className="font-mono"
              />
              <p className="text-[10px] text-muted-foreground">WiFi network name (optional)</p>
            </div>

            {/* VLAN ID */}
            <div className="space-y-2">
              <Label>VLAN ID</Label>
              <Input
                type="number"
                value={form.vlanId}
                onChange={(e) => setForm(prev => ({ ...prev, vlanId: e.target.value }))}
                placeholder="e.g. 100"
                className="font-mono"
              />
              <p className="text-[10px] text-muted-foreground">VLAN tag (optional)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || (!editingMapping && !form.portalId)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingMapping ? 'Update Mapping' : 'Create Mapping'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Pool Mapping?</AlertDialogTitle>
            <AlertDialogDescription>
              This pool will no longer be mapped to a captive portal. Clients in this
              subnet will not see a portal login page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Mapping
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
