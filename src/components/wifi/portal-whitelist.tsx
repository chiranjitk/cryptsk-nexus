'use client';

/**
 * Portal Whitelist / Walled Garden Component
 *
 * Hotel services captive portal bypass management.
 * Allows specific domains/URLs to bypass captive portal authentication
 * so guests can access hotel services without logging in first.
 *
 * API: /api/wifi/portal-whitelist (REST: GET/POST/PUT/DELETE)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  Globe,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  RefreshCw,
  Search,
  Download,
  Unlock,
  Lock,
  Hotel,
  ShieldCheck,
  Shield,
  Info,
  ChevronDown,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  MapPin,
  Cloud,
  Plane,
  Siren,
  ListChecks,
  Layers,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PropertySelector } from '@/components/common/property-selector';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface PortalWhitelistEntry {
  id: string;
  domain: string;
  path?: string | null;
  description?: string | null;
  protocol: string;
  bypassAuth: boolean;
  status: string;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}

interface WhitelistForm {
  domain: string;
  path: string;
  description: string;
  protocol: string;
  bypassAuth: boolean;
  priority: number;
}

// ─── Preset Domain Categories ──────────────────────────────────────────────────

interface PresetDomain {
  domain: string;
  path: string;
  description: string;
  protocol: string;
}

interface PresetCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  domains: PresetDomain[];
}

const PRESET_CATEGORIES: PresetCategory[] = [
  {
    id: 'hotel-booking',
    name: 'Hotel Booking',
    description: 'Popular hotel booking platforms for travelers',
    icon: <Hotel className="h-4 w-4" />,
    color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    domains: [
      { domain: '*.booking.com', path: '/', description: 'Booking.com', protocol: 'https' },
      { domain: '*.hotels.com', path: '/', description: 'Hotels.com', protocol: 'https' },
      { domain: '*.expedia.com', path: '/', description: 'Expedia', protocol: 'https' },
      { domain: '*.agoda.com', path: '/', description: 'Agoda', protocol: 'https' },
      { domain: '*.priceline.com', path: '/', description: 'Priceline', protocol: 'https' },
      { domain: '*.tripadvisor.com', path: '/', description: 'TripAdvisor Reviews', protocol: 'https' },
    ],
  },
  {
    id: 'maps-navigation',
    name: 'Maps & Navigation',
    description: 'Map and navigation services for directions',
    icon: <MapPin className="h-4 w-4" />,
    color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800',
    domains: [
      { domain: 'maps.google.com', path: '/', description: 'Google Maps', protocol: 'https' },
      { domain: '*.googleapis.com', path: '/maps', description: 'Google Maps API', protocol: 'https' },
      { domain: 'maps.apple.com', path: '/', description: 'Apple Maps', protocol: 'https' },
      { domain: '*.openstreetmap.org', path: '/', description: 'OpenStreetMap', protocol: 'https' },
    ],
  },
  {
    id: 'weather',
    name: 'Weather',
    description: 'Weather forecasting services',
    icon: <Cloud className="h-4 w-4" />,
    color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800',
    domains: [
      { domain: '*.weather.com', path: '/', description: 'Weather.com', protocol: 'https' },
      { domain: '*.accuweather.com', path: '/', description: 'AccuWeather', protocol: 'https' },
      { domain: '*.wunderground.com', path: '/', description: 'Weather Underground', protocol: 'https' },
    ],
  },
  {
    id: 'airline-travel',
    name: 'Airline & Travel',
    description: 'Common airline and travel websites for guests',
    icon: <Plane className="h-4 w-4" />,
    color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800',
    domains: [
      { domain: '*.airline.*', path: '/', description: 'Airline Websites (Wildcard)', protocol: 'https' },
      { domain: '*.kayak.com', path: '/', description: 'Kayak Flights', protocol: 'https' },
      { domain: '*.skyscanner.com', path: '/', description: 'Skyscanner', protocol: 'https' },
      { domain: '*.orbitz.com', path: '/', description: 'Orbitz', protocol: 'https' },
      { domain: '*.travelocity.com', path: '/', description: 'Travelocity', protocol: 'https' },
    ],
  },
  {
    id: 'emergency-services',
    name: 'Emergency Services',
    description: 'Critical emergency information and services',
    icon: <Siren className="h-4 w-4" />,
    color: 'text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    domains: [
      { domain: '*.ready.gov', path: '/', description: 'Ready.gov Emergency Info', protocol: 'https' },
      { domain: '*.fema.gov', path: '/', description: 'FEMA', protocol: 'https' },
      { domain: '*.emergency.law', path: '/', description: 'Emergency Law Resources', protocol: 'https' },
      { domain: '*.cdc.gov', path: '/', description: 'CDC Health Alerts', protocol: 'https' },
    ],
  },
];

// ─── Component ──────────────────────────────────────────────────────────────────

export default function PortalWhitelist() {
  const { toast } = useToast();
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const partnerId = propertyFilter !== 'all' ? propertyFilter : undefined;
  const [entries, setEntries] = useState<PortalWhitelistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPresetPanel, setShowPresetPanel] = useState(false);

  // Walled garden state
  const [wgStatus, setWgStatus] = useState<{ active: boolean; entries: number; ipCount: number; configExists: boolean; setExists: boolean; ruleExists: boolean } | null>(null);
  const [wgApplying, setWgApplying] = useState(false);
  const mountedRef = useRef(true);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PortalWhitelistEntry | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);

  // Presets dialog state
  const [presetsDialogOpen, setPresetsDialogOpen] = useState(false);
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const [applyingPresets, setApplyingPresets] = useState(false);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set([PRESET_CATEGORIES[0].id]));

  // Form state
  const [form, setForm] = useState<WhitelistForm>({
    domain: '',
    path: '/',
    description: '',
    protocol: 'https',
    bypassAuth: true,
    priority: 0,
  });

  // ─── API Helpers ─────────────────────────────────────────────────────────────

  const buildUrl = (base: string, params?: Record<string, string>) => {
    const url = new URL(base, window.location.origin);
    if (partnerId) url.searchParams.set('partnerId', partnerId);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  };

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(buildUrl('/api/wifi/portal-whitelist'));
      if (!res.ok) {
        toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' });
        return;
      }

      const data = await res.json();
      if (data.success && data.data) {
        setEntries(Array.isArray(data.data) ? data.data : []);
      } else {
        setEntries([]);
      }
    } catch (error) {
      console.error('Failed to fetch portal whitelist:', error);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [partnerId]);

  // ─── Walled Garden Status ──────────────────────────────────────────────────

  const fetchWgStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/wifi/walled-garden?action=status');
      if (!res.ok) {
        toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' });
        return;
      }

      const data = await res.json();
      if (data.success && data.data && mountedRef.current) {
        setWgStatus(data.data);
      }
    } catch (e) {
      console.error('WG status error:', e);
    }
  }, []);

  const handleApplyWg = useCallback(async () => {
    setWgApplying(true);
    try {
      const action = wgStatus?.active ? 'remove' : 'apply';
      const res = await fetch('/api/wifi/walled-garden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' });
        return;
      }

      const data = await res.json();
      if (data.success) {
        toast({
          title: wgStatus?.active ? 'Firewall Rules Removed' : 'Firewall Rules Applied',
          description: wgStatus?.active
            ? 'Walled garden rules have been removed from the firewall'
            : `Walled garden rules applied with ${data.data?.ipCount ?? 0} IPs`,
        });
        // Refresh status after a brief delay to allow nftables to settle
        setTimeout(() => fetchWgStatus(), 1000);
      } else {
        toast({
          title: 'Firewall Error',
          description: data.error || 'Failed to apply walled garden rules',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Network Error',
        description: 'Failed to communicate with the firewall service',
        variant: 'destructive',
      });
    } finally {
      if (mountedRef.current) setWgApplying(false);
    }
  }, [wgStatus, toast, fetchWgStatus]);

  useEffect(() => {
    mountedRef.current = true;
    fetchEntries();
    fetchWgStatus();
    return () => { mountedRef.current = false; };
  }, [fetchEntries, fetchWgStatus]);

  // ─── Form Helpers ───────────────────────────────────────────────────────────

  const resetForm = () => {
    setForm({ domain: '', path: '/', description: '', protocol: 'https', bypassAuth: true, priority: 0 });
    setEditingEntry(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (entry: PortalWhitelistEntry) => {
    setEditingEntry(entry);
    setForm({
      domain: entry.domain,
      path: entry.path || '/',
      description: entry.description || '',
      protocol: entry.protocol,
      bypassAuth: entry.bypassAuth,
      priority: entry.priority,
    });
    setDialogOpen(true);
  };

  // ─── CRUD Operations ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.domain.trim()) {
      toast({ title: 'Validation Error', description: 'Domain is required', variant: 'destructive' });
      return;
    }

    setSavingEntry(true);
    try {
      let res: Response;
      if (editingEntry) {
        // Update
        res = await fetch(buildUrl('/api/wifi/portal-whitelist'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingEntry.id,
            domain: form.domain,
            path: form.path || null,
            description: form.description || null,
            protocol: form.protocol,
            bypassAuth: form.bypassAuth,
            priority: form.priority,
          }),
        });
      } else {
        // Create
        res = await fetch(buildUrl('/api/wifi/portal-whitelist'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnerId,
            domain: form.domain,
            path: form.path || null,
            description: form.description || null,
            protocol: form.protocol,
            bypassAuth: form.bypassAuth,
            priority: form.priority,
          }),
        });
      }

      if (!res.ok) {
        toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' });
        return;
      }

      const data = await res.json();
      if (data.success) {
        toast({
          title: editingEntry ? 'Entry Updated' : 'Entry Added',
          description: `${form.domain} has been ${editingEntry ? 'updated' : 'added to the whitelist'}`,
        });
        setDialogOpen(false);
        resetForm();
        fetchEntries();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to save entry', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', description: 'Failed to save entry', variant: 'destructive' });
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteEntryId) return;
    try {
      const res = await fetch(buildUrl('/api/wifi/portal-whitelist'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteEntryId }),
      });
      if (!res.ok) {
        toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' });
        return;
      }

      const data = await res.json();
      if (data.success) {
        toast({ title: 'Deleted', description: 'Whitelist entry removed' });
        fetchEntries();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to delete', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', description: 'Failed to delete', variant: 'destructive' });
    } finally {
      setDeleteEntryId(null);
    }
  };

  const handleToggle = async (entry: PortalWhitelistEntry) => {
    const newStatus = entry.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(buildUrl('/api/wifi/portal-whitelist'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, status: newStatus }),
      });
      if (!res.ok) {
        toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' });
        return;
      }

      const data = await res.json();
      if (data.success) {
        toast({ title: 'Status Updated', description: `${entry.domain} is now ${newStatus}` });
        fetchEntries();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to update status', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network Error', description: 'Failed to toggle status', variant: 'destructive' });
    }
  };

  // ─── Apply Preset Category ─────────────────────────────────────────────────

  const togglePresetSelection = (domainKey: string) => {
    setSelectedPresets(prev => {
      const next = new Set(prev);
      if (next.has(domainKey)) {
        next.delete(domainKey);
      } else {
        next.add(domainKey);
      }
      return next;
    });
  };

  const toggleCategoryAll = (category: PresetCategory) => {
    const domainKeys = category.domains.map(d => `${category.id}:${d.domain}`);
    const allSelected = domainKeys.every(k => selectedPresets.has(k));

    setSelectedPresets(prev => {
      const next = new Set(prev);
      if (allSelected) {
        domainKeys.forEach(k => next.delete(k));
      } else {
        domainKeys.forEach(k => next.add(k));
      }
      return next;
    });
  };

  const handleApplySelectedPresets = async () => {
    if (selectedPresets.size === 0) return;

    setApplyingPresets(true);
    let addedCount = 0;
    let errorCount = 0;

    for (const key of selectedPresets) {
      const [categoryId, domain] = key.split(':');
      const category = PRESET_CATEGORIES.find(c => c.id === categoryId);
      const preset = category?.domains.find(d => d.domain === domain);
      if (!preset) continue;

      try {
        const res = await fetch(buildUrl('/api/wifi/portal-whitelist'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnerId,
            domain: preset.domain,
            path: preset.path,
            description: preset.description,
            protocol: preset.protocol,
            bypassAuth: true,
            priority: 0,
            status: 'active',
          }),
        });
        const data = await res.json();
        if (data.success) {
          addedCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    if (addedCount > 0) {
      toast({
        title: 'Presets Applied',
        description: `${addedCount} domain${addedCount > 1 ? 's' : ''} added to whitelist${errorCount > 0 ? ` (${errorCount} already existed or failed)` : ''}`,
      });
      fetchEntries();
    } else if (errorCount > 0) {
      toast({
        title: 'Presets Not Applied',
        description: 'All selected domains already exist in the whitelist',
        variant: 'destructive',
      });
    }

    setApplyingPresets(false);
    setSelectedPresets(new Set());
    setPresetsDialogOpen(false);
  };

  // ─── Export DNS Config ──────────────────────────────────────────────────────

  const handleExportDns = async () => {
    try {
      const res = await fetch(buildUrl('/api/wifi/portal-whitelist', { export: 'dns' }));
      if (!res.ok) {
        toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' });
        return;
      }

      const data = await res.json();
      if (data.success && data.data) {
        const blob = new Blob([data.data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'portal-whitelist-dns.conf';
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'Exported', description: 'DNS configuration file downloaded' });
      } else {
        // Fallback to client-side generation
        exportFallbackDns();
      }
    } catch {
      exportFallbackDns();
    }
  };

  const exportFallbackDns = () => {
    const active = entries.filter(e => e.status === 'active');
    const config = [
      '; StaySuite Portal Whitelist - Walled Garden DNS Configuration',
      '; Generated: ' + new Date().toISOString(),
      '; Total bypass entries: ' + active.length,
      ';',
      '; Add these entries to your DNS server or firewall rules',
      '; to allow unauthenticated access to these domains.',
      '',
    ];
    active.forEach(e => {
      config.push(`; ${e.description || e.domain}`);
      config.push(`${e.domain} IN CNAME captive-portal-bypass.local`);
      config.push('');
    });
    const blob = new Blob([config.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'portal-whitelist-dns.conf';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: 'DNS configuration file downloaded' });
  };

  // ─── Filtering ──────────────────────────────────────────────────────────────

  const filteredEntries = entries.filter(e => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return e.domain.toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.path || '').toLowerCase().includes(q);
    }
    return true;
  });

  const activeCount = entries.filter(e => e.status === 'active').length;
  const inactiveCount = entries.length - activeCount;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Info Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Walled Garden / Portal Whitelist</p>
          <p className="text-xs text-blue-700/80 dark:text-blue-400/70 mt-1">
            Domains listed here bypass captive portal authentication. Guests can access these hotel services
            (booking engine, restaurant menu, spa, etc.) without logging into WiFi first.
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Total Entries Card */}
        <div className="relative overflow-hidden rounded-lg border bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-l-4 border-l-blue-500 p-4 dark:from-blue-500/5 dark:to-cyan-500/5">
          <div className="absolute -right-3 -top-3 opacity-[0.07]">
            <Globe className="h-24 w-24" />
          </div>
          <div className="relative">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Entries</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold">{entries.length}</span>
              <span className="text-sm text-muted-foreground">domain{entries.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* Active Card */}
        <div className="relative overflow-hidden rounded-lg border bg-gradient-to-r from-emerald-500/10 to-green-500/10 border-l-4 border-l-emerald-500 p-4 dark:from-emerald-500/5 dark:to-green-500/5">
          <div className="absolute -right-3 -top-3 opacity-[0.07]">
            <ShieldCheck className="h-24 w-24" />
          </div>
          <div className="relative">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{activeCount}</span>
              {inactiveCount > 0 && (
                <span className="text-sm text-muted-foreground">{inactiveCount} inactive</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions Row */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Walled Garden Status Badge */}
          {wgStatus && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] gap-1',
                wgStatus.active
                  ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                  : 'border-amber-500/50 text-amber-600',
              )}
            >
              {wgStatus.active ? (
                <>
                  <CheckCircle className="h-3 w-3" />
                  Firewall Active ({wgStatus.ipCount} IPs)
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3" />
                  Not Applied
                </>
              )}
            </Badge>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Walled Garden Apply / Remove Button */}
          <Button
            variant={wgStatus?.active ? 'destructive' : 'default'}
            size="sm"
            onClick={handleApplyWg}
            disabled={wgApplying}
            className={!wgStatus?.active ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : undefined}
          >
            {wgApplying ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : wgStatus?.active ? (
              <XCircle className="h-4 w-4 mr-1.5" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-1.5" />
            )}
            {wgStatus?.active ? 'Remove Rules' : 'Apply to Firewall'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPresetsDialogOpen(true)}>
            <Layers className="h-4 w-4 mr-1.5" />
            Presets
          </Button>
          <Button variant="outline" size="sm" onClick={fetchEntries} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportDns} disabled={entries.length === 0}>
            <Download className="h-4 w-4 mr-1.5" />
            Export DNS
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Domain
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search domains, descriptions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Whitelist Table / Cards */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEntries.length === 0 ? (
            /* Enhanced Empty State */
            <div className="relative flex flex-col items-center justify-center py-20 text-center px-4 overflow-hidden">
              {/* Background dot pattern */}
              <div
                className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
                style={{
                  backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              />

              {/* Decorative SVG illustration */}
              <div className="relative mb-6">
                <div className="rounded-full bg-gradient-to-br from-teal-50 to-cyan-50 p-6 dark:from-teal-950/40 dark:to-cyan-950/40">
                  <svg
                    width="80"
                    height="80"
                    viewBox="0 0 80 80"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-teal-400 dark:text-teal-500"
                  >
                    {/* Globe */}
                    <circle cx="40" cy="36" r="20" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" />
                    <ellipse cx="40" cy="36" rx="10" ry="20" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.3" />
                    <line x1="20" y1="36" x2="60" y2="36" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
                    <line x1="24" y1="26" x2="56" y2="26" stroke="currentColor" strokeWidth="1" opacity="0.2" />
                    <line x1="24" y1="46" x2="56" y2="46" stroke="currentColor" strokeWidth="1" opacity="0.2" />
                    {/* Shield overlay */}
                    <path
                      d="M44 24 L44 16 C44 14 46 12 48 12 L56 12 C58 12 60 14 60 16 L60 28 C60 36 54 40 52 42 C50 40 44 36 44 28 Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path
                      d="M52 22 L50 26 L54 26 Z"
                      stroke="currentColor"
                      strokeWidth="1"
                      fill="currentColor"
                      fillOpacity="0.4"
                      transform="rotate(180 52 24)"
                    />
                    <path d="M49 24 L51 27 L55 21" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                {/* Decorative ring */}
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-teal-200/50 dark:border-teal-700/30 animate-[spin_30s_linear_infinite]" />
              </div>

              <h3 className="text-lg font-semibold text-foreground mb-2">
                {searchQuery ? 'No matching entries' : 'No whitelist entries yet'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                {searchQuery
                  ? 'Try adjusting your search terms or clear the search filter'
                  : 'Add domains that should bypass the captive portal authentication, allowing guests to access key services without WiFi login.'}
              </p>

              {!searchQuery && (
                <div className="flex items-center gap-3">
                  <Button onClick={openCreate} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Domain
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPresetsDialogOpen(true)}>
                    <Layers className="h-4 w-4 mr-1.5" />
                    Browse Presets
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Desktop: Table view */}
              <div className="hidden sm:block max-h-[500px] overflow-auto">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Bypass Auth</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow
                        key={entry.id}
                        className={cn(
                          'transition-colors hover:bg-teal-50/50 dark:hover:bg-teal-950/20 hover:border-l-2 hover:border-l-teal-500',
                          entry.status !== 'active' && 'opacity-50',
                        )}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <p className="font-mono text-sm font-medium">{entry.domain}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground font-mono">{entry.path || '/'}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{entry.description || '—'}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                            {entry.protocol}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {entry.bypassAuth ? (
                            <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 text-[10px] gap-1">
                              <Unlock className="h-3 w-3" /> Bypass
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <Lock className="h-3 w-3" /> Require
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={entry.status === 'active'}
                            onCheckedChange={() => handleToggle(entry)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(entry)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteEntryId(entry.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>

              {/* Mobile: Card view */}
              <div className="sm:hidden divide-y">
                {filteredEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn('p-4 space-y-3 transition-colors', entry.status !== 'active' && 'opacity-50')}
                  >
                    {/* Domain + status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="font-mono text-sm font-medium truncate">{entry.domain}</p>
                      </div>
                      <Switch
                        checked={entry.status === 'active'}
                        onCheckedChange={() => handleToggle(entry)}
                      />
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Path:</span>
                        <span className="ml-1 font-mono">{entry.path || '/'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Protocol:</span>
                        <Badge variant="outline" className="text-[10px] uppercase ml-1">{entry.protocol}</Badge>
                      </div>
                      {entry.description && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Description:</span>
                          <span className="ml-1">{entry.description}</span>
                        </div>
                      )}
                    </div>

                    {/* Bypass badge + actions */}
                    <div className="flex items-center justify-between">
          <PropertySelector value={propertyFilter} onValueChange={setPropertyFilter} />
                      {entry.bypassAuth ? (
                        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 text-[10px] gap-1">
                          <Unlock className="h-3 w-3" /> Bypass Auth
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Lock className="h-3 w-3" /> Auth Required
                        </Badge>
                      )}
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(entry)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDeleteEntryId(entry.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Globe className="h-4 w-4 text-primary" />
              </div>
              {editingEntry ? 'Edit Whitelist Entry' : 'Add Whitelist Entry'}
            </DialogTitle>
            <DialogDescription>
              {editingEntry
                ? 'Update domain bypass settings for the captive portal'
                : 'Add a domain that guests can access without WiFi authentication'}
            </DialogDescription>
          </DialogHeader>

          <Separator />

          <div className="grid gap-5 py-2">
            {/* Domain Field */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-100 dark:bg-blue-900/40">
                  <Globe className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </div>
                Domain *
              </Label>
              <Input
                value={form.domain}
                onChange={(e) => setForm(prev => ({ ...prev, domain: e.target.value }))}
                placeholder="e.g. booking.hotel.com or *.example.com"
                className="font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Use *.domain.com for wildcard matching of all subdomains
              </p>
            </div>

            <Separator />

            {/* Path & Protocol Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-teal-100 dark:bg-teal-900/40">
                    <FileText className="h-3 w-3 text-teal-600 dark:text-teal-400" />
                  </div>
                  Path
                </Label>
                <Input
                  value={form.path}
                  onChange={(e) => setForm(prev => ({ ...prev, path: e.target.value }))}
                  placeholder="/"
                  className="font-mono"
                />
                <p className="text-[10px] text-muted-foreground">Leave / for all paths</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-100 dark:bg-amber-900/40">
                    <Shield className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  </div>
                  Protocol
                </Label>
                <Select value={form.protocol} onValueChange={(v) => setForm(prev => ({ ...prev, protocol: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="https">HTTPS</SelectItem>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="both">Both (HTTP + HTTPS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Description Field */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-purple-100 dark:bg-purple-900/40">
                  <FileText className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                </div>
                Description
              </Label>
              <Input
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="e.g. Hotel booking engine"
              />
            </div>

            <Separator />

            {/* Priority & Bypass Auth Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 dark:bg-emerald-900/40">
                    <ListChecks className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  Priority
                </Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                />
                <p className="text-[10px] text-muted-foreground">Higher = matched first</p>
              </div>
              <div className="flex items-end space-x-2 pb-1">
                <Switch
                  checked={form.bypassAuth}
                  onCheckedChange={(checked) => setForm(prev => ({ ...prev, bypassAuth: checked }))}
                />
                <Label className="text-sm">Bypass authentication</Label>
              </div>
            </div>
          </div>

          <Separator />

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={savingEntry} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {savingEntry && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingEntry ? 'Update' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preset Domain Categories Dialog */}
      <Dialog open={presetsDialogOpen} onOpenChange={setPresetsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-4 w-4 text-primary" />
              </div>
              Domain Preset Categories
            </DialogTitle>
            <DialogDescription>
              Select domain categories commonly needed in hospitality environments. These will be added as whitelist entries.
            </DialogDescription>
          </DialogHeader>

          <Separator />

          <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1 -mr-1">
            {PRESET_CATEGORIES.map((category) => {
              const allDomainKeys = category.domains.map(d => `${category.id}:${d.domain}`);
              const allSelected = allDomainKeys.every(k => selectedPresets.has(k));
              const someSelected = allDomainKeys.some(k => selectedPresets.has(k));

              return (
                <Collapsible
                  key={category.id}
                  open={openCategories.has(category.id)}
                  onOpenChange={(open) => {
                    setOpenCategories(prev => {
                      const next = new Set(prev);
                      if (open) next.add(category.id);
                      else next.delete(category.id);
                      return next;
                    });
                  }}
                >
                  <div className={cn(
                    'rounded-lg border transition-colors',
                    someSelected ? 'border-primary/30 bg-primary/[0.02]' : 'border-border',
                  )}>
                    {/* Category Header */}
                    <div className="flex items-center gap-3 p-3">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => toggleCategoryAll(category)}
                        className={someSelected && !allSelected ? 'data-[state=unchecked]:bg-primary/20' : undefined}
                        {...(someSelected && !allSelected ? { 'data-state': 'indeterminate' as const } : {})}
                      />
                      <div className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-md border',
                        category.color,
                      )}>
                        {category.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{category.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{category.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {category.domains.length} domain{category.domains.length !== 1 ? 's' : ''}
                        </Badge>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <ChevronDown className={cn(
                              'h-4 w-4 transition-transform',
                              openCategories.has(category.id) && 'rotate-180',
                            )} />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>

                    {/* Category Domains */}
                    <CollapsibleContent>
                      <div className="border-t px-3 pb-3 pt-2 space-y-2">
                        {category.domains.map((domain) => {
                          const domainKey = `${category.id}:${domain.domain}`;
                          const isSelected = selectedPresets.has(domainKey);
                          const alreadyExists = entries.some(e => e.domain === domain.domain);

                          return (
                            <label
                              key={domain.domain}
                              className={cn(
                                'flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors',
                                isSelected ? 'bg-primary/5' : 'hover:bg-muted/50',
                                alreadyExists && 'opacity-50',
                              )}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => togglePresetSelection(domainKey)}
                                disabled={alreadyExists}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-mono text-sm">{domain.domain}</p>
                                  {alreadyExists && (
                                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200">
                                      <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                                      Added
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{domain.description}</p>
                              </div>
                              <Badge variant="outline" className="text-[10px] uppercase shrink-0">
                                {domain.protocol}
                              </Badge>
                            </label>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>

          <Separator />

          <DialogFooter className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedPresets.size > 0 ? (
                <span>{selectedPresets.size} domain{selectedPresets.size !== 1 ? 's' : ''} selected</span>
              ) : (
                <span>Select domains to add</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setSelectedPresets(new Set()); setPresetsDialogOpen(false); }}>
                Cancel
              </Button>
              <Button
                onClick={handleApplySelectedPresets}
                disabled={selectedPresets.size === 0 || applyingPresets}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {applyingPresets && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Plus className="h-4 w-4 mr-1.5" />
                Add {selectedPresets.size > 0 ? `${selectedPresets.size} Domain${selectedPresets.size !== 1 ? 's' : ''}` : 'Domains'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteEntryId} onOpenChange={(open) => { if (!open) setDeleteEntryId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Whitelist?</AlertDialogTitle>
            <AlertDialogDescription>
              This domain will no longer bypass the captive portal. Guests will need to authenticate
              via WiFi login before accessing it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
