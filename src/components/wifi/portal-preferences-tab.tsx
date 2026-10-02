'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  Smartphone,
  Key,
  MonitorSmartphone,
  Save,
  RotateCcw,
  Loader2,
  Info,
  LogIn,
  ExternalLink,
  Monitor,
  Building2,
  ChevronDown,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

import type { PortalPreferencesSettings } from '@/lib/wifi-settings';

// ── Default values (mirrors wifi-settings.ts) ───────────────────────────────────

const DEFAULTS: PortalPreferencesSettings = {
  appRateLimitEnabled: false,
  voucherMaxAttempts: 10, voucherWindowMinutes: 15,
  roomAuthMaxAttempts: 5, roomAuthWindowMinutes: 15,
  otpSendPerPhoneMax: 5, otpSendPerPhoneWindowMinutes: 15,
  otpSendPerIpMax: 10, otpSendPerIpWindowMinutes: 15,
  otpVerifyMaxAttempts: 5,
  credentialsMaxAttempts: 10, credentialsWindowMinutes: 15,
  socialMaxAttempts: 10, socialWindowMinutes: 15,
  ldapMaxAttempts: 5, ldapWindowMinutes: 15,
  macAuthMaxAttempts: 10, macAuthWindowMinutes: 15,
  selfRegMaxAttempts: 3, selfRegWindowMinutes: 15,
  openAccessMaxAttempts: 10, openAccessWindowMinutes: 60,
  lockoutTier1Attempts: 5, lockoutTier1Seconds: 30,
  lockoutTier2Attempts: 10, lockoutTier2Seconds: 60,
  lockoutTier3Attempts: 20, lockoutTier3Seconds: 300,
  otpCodeLength: 6, otpExpirySeconds: 300, otpMaxRetries: 3,
  macAuthValidityDays: 30, socialAuthDurationHours: 24,
  ldapTimeoutSeconds: 30, turnstileTimeoutMs: 2000,
  maxDevicesPerGuest: 5, deviceAutoCleanupDays: 30,
  fingerprintMismatchAction: 'warn',
  // ── Post-Login Behavior ──
  postLoginMode: 'stay' as const,
  postLoginRedirectUrl: '',
  postLoginRedirectTarget: '_self' as const,
  // ── CNA ──
  cnaEnabledMac: true,
};

// ── Shared small components ────────────────────────────────────────────────────

function FieldGroup({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        {description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {description}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}

function NumField({
  label, description, value, onChange, min = 0, max = 99999, suffix, disabled = false,
}: {
  label: string; description?: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; suffix?: string; disabled?: boolean;
}) {
  return (
    <FieldGroup label={label} description={description}>
      <div className="relative">
        <Input
          type="number" min={min} max={max} value={value} disabled={disabled}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
          className="pr-10 h-9 text-sm"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </FieldGroup>
  );
}

function RateRow({
  label, description, attempts, windowMin, onAttemptsChange, onWindowChange,
  attemptsLabel = 'Max attempts', disabled = false,
}: {
  label: string; description?: string;
  attempts: number; windowMin: number;
  onAttemptsChange: (v: number) => void; onWindowChange: (v: number) => void;
  attemptsLabel?: string; disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <NumField
        label={attemptsLabel} description={description}
        value={attempts} onChange={onAttemptsChange} min={1} max={100} disabled={disabled}
      />
      <NumField
        label="Window" description="Time window for rate limit"
        value={windowMin} onChange={onWindowChange} min={1} max={1440} suffix="min" disabled={disabled}
      />
    </div>
  );
}

function SectionCard({
  icon: Icon, title, description, badge, badgeVariant = 'secondary', children, disabled = false,
}: {
  icon: React.ElementType; title: string; description: string; badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <Card className={!disabled ? '' : 'opacity-60 pointer-events-none'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          {badge && <Badge variant={badgeVariant} className="text-[10px]">{badge}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

// ── Partner-level redirect config row ─────────────────────────────────────────

interface PropertyRedirect {
  partnerId: string;
  propertyName: string;
  postLoginMode: 'stay' | 'redirect';
  postLoginRedirectUrl: string;
  postLoginRedirectTarget: '_self' | '_blank';
}

function PropertyRedirectRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: PropertyRedirect;
  onUpdate: (patch: Partial<PropertyRedirect>) => void;
  onRemove: () => void;
}) {
  const isRedirect = item.postLoginMode === 'redirect';
  return (
    <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{item.propertyName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={item.postLoginMode}
            onValueChange={(v) => onUpdate({ postLoginMode: v as 'stay' | 'redirect', postLoginRedirectUrl: v === 'stay' ? '' : item.postLoginRedirectUrl })}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stay">Stay on Portal</SelectItem>
              <SelectItem value="redirect">Redirect to URL</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <span className="text-xs">✕</span>
          </Button>
        </div>
      </div>

      {isRedirect && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <Input
            type="url"
            placeholder="accsium.com or https://www.example.com/welcome"
            value={item.postLoginRedirectUrl}
            onChange={(e) => onUpdate({ postLoginRedirectUrl: e.target.value })}
            className="h-8 text-xs"
          />
          <Select
            value={item.postLoginRedirectTarget}
            onValueChange={(v) => onUpdate({ postLoginRedirectTarget: v as '_self' | '_blank' })}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_self">Same Window</SelectItem>
              <SelectItem value="_blank">New Tab</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function PortalPreferencesTab() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<PortalPreferencesSettings>(DEFAULTS);
  const [original, setOriginal] = useState<PortalPreferencesSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // ── Partner-level redirect state ──
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [propertyRedirects, setPropertyRedirects] = useState<PropertyRedirect[]>([]);
  const [originalPropertyRedirects, setOriginalPropertyRedirects] = useState<PropertyRedirect[]>([]);
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [propDirty, setPropDirty] = useState(false);
  const initRef = useRef(false);

  // Fetch properties list
  useEffect(() => {
    fetch('/api/properties?limit=100')
      .then(r => r.json())
      .then(d => { if (d.success) setProperties(d.data.map((p: Record<string, unknown>) => ({ id: p.id as string, name: p.name as string }))); })
      .catch(() => {});
  }, []);

  // Fetch property-level redirect configs (only for properties that have explicit settings)
  const loadPropertyRedirects = useCallback(async () => {
    if (properties.length === 0) return;
    try {
      // 1. Get list of property IDs that have explicit portal_preferences rows
      const listRes = await fetch('/api/v1/wifi/portal-preferences?configuredProperties=1');
      const listJson = await listRes.json();
      const configuredIds: string[] = listJson.success ? (listJson.data || []) : [];

      if (configuredIds.length === 0) {
        setPropertyRedirects([]);
        setOriginalPropertyRedirects([]);
        setPropDirty(false);
        return;
      }

      // 2. Fetch prefs only for configured properties
      const results = await Promise.all(
        configuredIds.map(async (propId) => {
          const prop = properties.find(p => p.id === propId);
          if (!prop) return null;
          const res = await fetch(`/api/v1/wifi/portal-preferences?partnerId=${propId}`);
          const json = await res.json();
          if (json.success && json.data) {
            return {
              partnerId: propId,
              propertyName: prop.name,
              postLoginMode: json.data.postLoginMode || 'stay',
              postLoginRedirectUrl: json.data.postLoginRedirectUrl || '',
              postLoginRedirectTarget: json.data.postLoginRedirectTarget || '_self',
            } as PropertyRedirect;
          }
          return null;
        })
      );
      const valid = results.filter((r): r is PropertyRedirect => r !== null);
      setPropertyRedirects(valid);
      setOriginalPropertyRedirects(valid);
      setPropDirty(false);
    } catch {
      // silent
    }
  }, [properties]);

  useEffect(() => {
    if (properties.length > 0 && !initRef.current) {
      initRef.current = true;
      loadPropertyRedirects();
    }
  }, [properties, loadPropertyRedirects]);

  const reloadPropertyRedirects = useCallback(() => {
    initRef.current = false;
    loadPropertyRedirects();
  }, [loadPropertyRedirects]);

  // ── Global prefs load/save ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/wifi/portal-preferences');
      const json = await res.json();
      if (json.success) {
        setPrefs(json.data);
        setOriginal(json.data);
        setDirty(false);
      }
    } catch (e) {
      toast({ title: 'Failed to load preferences', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const update = <K extends keyof PortalPreferencesSettings>(key: K, val: PortalPreferencesSettings[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: val };
      setDirty(JSON.stringify(next) !== JSON.stringify(original));
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    let globalOk = true;
    let propOk = true;

    // 1. Save global prefs (if changed)
    if (dirty) {
      try {
        const res = await fetch('/api/v1/wifi/portal-preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prefs),
        });
        const json = await res.json();
        if (json.success) {
          setOriginal(json.data);
          setDirty(false);
        } else {
          toast({ title: 'Global save failed', description: json.error?.message || 'Unknown error', variant: 'destructive' });
          globalOk = false;
        }
      } catch {
        toast({ title: 'Global save failed', variant: 'destructive' });
        globalOk = false;
      }
    }

    // 2. Save property-level redirect overrides (if changed)
    if (propDirty) {
      try {
        // Delete properties that were removed from the list
        const currentIds = new Set(propertyRedirects.map(r => r.partnerId));
        const removedOriginals = originalPropertyRedirects.filter(r => !currentIds.has(r.partnerId));
        await Promise.all(
          removedOriginals.map(r => fetch(`/api/v1/wifi/portal-preferences?partnerId=${r.partnerId}`, { method: 'DELETE' }))
        );

        // Save each property's redirect config (only send redirect-related fields)
        const savePromises = propertyRedirects.map(async (item) => {
          const res = await fetch('/api/v1/wifi/portal-preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postLoginMode: item.postLoginMode,
              postLoginRedirectUrl: item.postLoginRedirectUrl,
              postLoginRedirectTarget: item.postLoginRedirectTarget,
              partnerId: item.partnerId,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('[PortalPrefs] Failed to save property redirect:', item.propertyName, err);
          }
          return res;
        });
        await Promise.all(savePromises);
        setOriginalPropertyRedirects([...propertyRedirects]);
        setPropDirty(false);
        toast({ title: 'Partner redirect saved', description: `${propertyRedirects.length} property redirect(s) updated.` });
      } catch {
        toast({ title: 'Partner redirect save failed', variant: 'destructive' });
        propOk = false;
      }
    }

    if (globalOk && propOk && (dirty || propDirty)) {
      // Success toasts already shown above
    }
    setSaving(false);
  };

  const hasChanges = dirty || propDirty;

  const handleReset = () => {
    setPrefs(original);
    setDirty(false);
    setPropertyRedirects([...originalPropertyRedirects]);
    setPropDirty(false);
  };

  const updatePropertyRedirect = (idx: number, patch: Partial<PropertyRedirect>) => {
    setPropertyRedirects((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      setPropDirty(JSON.stringify(next) !== JSON.stringify(originalPropertyRedirects));
      return next;
    });
  };

  const removePropertyRedirect = (idx: number) => {
    setPropertyRedirects((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      setPropDirty(JSON.stringify(next) !== JSON.stringify(originalPropertyRedirects));
      return next;
    });
  };

  const addPropertyRedirect = (partnerId: string) => {
    const prop = properties.find(p => p.id === partnerId);
    if (!prop) return;
    // Don't add if already exists
    if (propertyRedirects.some(r => r.partnerId === partnerId)) return;
    setPropertyRedirects((prev) => {
      const next = [...prev, {
        partnerId: prop.id,
        propertyName: prop.name,
        postLoginMode: 'redirect' as const,
        postLoginRedirectUrl: '',
        postLoginRedirectTarget: '_self' as const,
      }];
      setPropDirty(true);
      return next;
    });
    setAddPropertyOpen(false);
  };

  // Properties available to add (not already in the list)
  const availableProperties = properties.filter(
    p => !propertyRedirects.some(r => r.partnerId === p.id)
  );

  if (loading) {
    return (
      <div className="space-y-4 p-1">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Portal Preferences</h2>
          {hasChanges && <Badge variant="outline" className="text-amber-600 border-amber-400">Unsaved changes</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save Changes
          </Button>
        </div>
      </div>

      <Separator />

      {/* ── 6. Post-Login Behavior ── */}
      <SectionCard
        icon={LogIn} title="Post-Login Behavior"
        description="Control what happens after a guest successfully authenticates. Set a global default or configure per-property redirect URLs."
        badge={prefs.postLoginMode === 'stay' ? 'Stay on Portal' : 'Redirect'}
        badgeVariant={prefs.postLoginMode === 'redirect' ? 'default' : 'secondary'}
      >
        {/* Global default */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Global Default (all properties)</p>
          <FieldGroup
            label="After Successful Login"
            description="Default behavior for all portal zones. Can be overridden per-property below."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => update('postLoginMode', 'stay')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors cursor-pointer ${
                  prefs.postLoginMode === 'stay'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <Monitor className="h-6 w-6" style={{ color: prefs.postLoginMode === 'stay' ? 'var(--primary)' : 'var(--muted-foreground)' }} />
                <span className={`text-sm font-medium ${prefs.postLoginMode === 'stay' ? 'text-primary' : ''}`}>Stay on Portal</span>
                <span className="text-xs text-muted-foreground text-center leading-tight">
                  Show success page with session timer, data usage, and logout button
                </span>
              </button>
              <button
                type="button"
                onClick={() => update('postLoginMode', 'redirect')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors cursor-pointer ${
                  prefs.postLoginMode === 'redirect'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <ExternalLink className="h-6 w-6" style={{ color: prefs.postLoginMode === 'redirect' ? 'var(--primary)' : 'var(--muted-foreground)' }} />
                <span className={`text-sm font-medium ${prefs.postLoginMode === 'redirect' ? 'text-primary' : ''}`}>Redirect to URL</span>
                <span className="text-xs text-muted-foreground text-center leading-tight">
                  Redirect guest to a custom URL (hotel website, welcome page, etc.)
                </span>
              </button>
            </div>
          </FieldGroup>

          {prefs.postLoginMode === 'redirect' && (
            <>
              <Separator />
              <FieldGroup
                label="Global Redirect URL"
                description="Default URL for all properties without a specific override. You can enter just the domain (e.g. accsium.com) — https:// is added automatically."
              >
                <Input
                  type="url"
                  placeholder="accsium.com or https://www.example.com/welcome"
                  value={prefs.postLoginRedirectUrl}
                  onChange={(e) => update('postLoginRedirectUrl', e.target.value)}
                  className="h-9 text-sm"
                />
              </FieldGroup>
              <FieldGroup
                label="Open In"
                description="Choose whether the URL opens in the same browser window or a new tab"
              >
                <Select
                  value={prefs.postLoginRedirectTarget}
                  onValueChange={(v) => update('postLoginRedirectTarget', v as '_self' | '_blank')}
                >
                  <SelectTrigger className="h-9 text-sm w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_self">Same Window</SelectItem>
                    <SelectItem value="_blank">New Tab</SelectItem>
                  </SelectContent>
                </Select>
              </FieldGroup>
            </>
          )}
        </div>

        {/* Partner-specific overrides */}
        {properties.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Per-Partner Redirect Overrides</p>
                {availableProperties.length > 0 && (
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setAddPropertyOpen(!addPropertyOpen)}
                      onBlur={() => setTimeout(() => setAddPropertyOpen(false), 150)}
                    >
                      <Building2 className="h-3 w-3 mr-1" />
                      Add Partner
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                    {addPropertyOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-md border bg-popover p-1 shadow-md">
                        {availableProperties.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-accent cursor-pointer"
                            onMouseDown={(e) => e.preventDefault()} // prevent blur before click
                            onClick={() => addPropertyRedirect(p.id)}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {propertyRedirects.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <Building2 className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No property-specific redirects configured.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click "Add Partner" to set a custom redirect URL for a specific partner. The global default above will be used for all other properties.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {propertyRedirects.map((item, idx) => (
                    <PropertyRedirectRow
                      key={item.partnerId}
                      item={item}
                      onUpdate={(patch) => updatePropertyRedirect(idx, patch)}
                      onRemove={() => removePropertyRedirect(idx)}
                    />
                  ))}
                </div>
              )}

              {propertyRedirects.length > 0 && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    <strong>How it works:</strong> When a guest connects through a portal zone, the system checks if the zone's property has a specific redirect configured here. If found, that redirect URL is used. Otherwise, the global default above applies.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {prefs.postLoginMode === 'redirect' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Note:</strong> The redirect URL must be accessible over HTTP (not HTTPS-only), or the guest's browser may fail before the firewall allows HTTPS traffic.
            </p>
          </div>
        )}
      </SectionCard>

      {/* ── 1. Rate Limiting ── */}
      <SectionCard
        icon={Shield} title="Application Rate Limiting"
        description="Enforce rate limits at the application layer for portal authentication methods"
        badge={prefs.appRateLimitEnabled ? 'Enabled' : 'Disabled'}
        badgeVariant={prefs.appRateLimitEnabled ? 'default' : 'secondary'}
      >
        <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
          <div>
            <Label className="text-sm font-medium">Enable Application-Level Rate Limiting</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              When OFF, rate limiting relies on network-level controls only. When ON, the app also enforces per-method limits using a PG-backed store.
            </p>
          </div>
          <Switch
            checked={prefs.appRateLimitEnabled}
            onCheckedChange={(v) => update('appRateLimitEnabled', v)}
          />
        </div>

        <div className={`space-y-4 ${!prefs.appRateLimitEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Voucher Authentication</p>
          <RateRow
            label="Voucher Rate Limit"
            description="Max voucher auth attempts per IP within the window"
            attempts={prefs.voucherMaxAttempts} windowMin={prefs.voucherWindowMinutes}
            onAttemptsChange={(v) => update('voucherMaxAttempts', v)}
            onWindowChange={(v) => update('voucherWindowMinutes', v)}
            disabled={!prefs.appRateLimitEnabled}
          />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Room Authentication</p>
          <RateRow
            label="Room Auth Rate Limit"
            description="Max room+name auth attempts per IP within the window"
            attempts={prefs.roomAuthMaxAttempts} windowMin={prefs.roomAuthWindowMinutes}
            onAttemptsChange={(v) => update('roomAuthMaxAttempts', v)}
            onWindowChange={(v) => update('roomAuthWindowMinutes', v)}
            disabled={!prefs.appRateLimitEnabled}
          />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Credentials Authentication</p>
          <RateRow
            label="Credentials Auth Rate Limit"
            description="Max credential login attempts per IP within the window"
            attempts={prefs.credentialsMaxAttempts} windowMin={prefs.credentialsWindowMinutes}
            onAttemptsChange={(v) => update('credentialsMaxAttempts', v)}
            onWindowChange={(v) => update('credentialsWindowMinutes', v)}
            disabled={!prefs.appRateLimitEnabled}
          />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Social Authentication</p>
          <RateRow
            label="Social Auth Rate Limit"
            description="Max social login attempts per IP within the window"
            attempts={prefs.socialMaxAttempts} windowMin={prefs.socialWindowMinutes}
            onAttemptsChange={(v) => update('socialMaxAttempts', v)}
            onWindowChange={(v) => update('socialWindowMinutes', v)}
            disabled={!prefs.appRateLimitEnabled}
          />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">LDAP Authentication</p>
          <RateRow
            label="LDAP Auth Rate Limit"
            description="Max LDAP bind attempts per IP within the window"
            attempts={prefs.ldapMaxAttempts} windowMin={prefs.ldapWindowMinutes}
            onAttemptsChange={(v) => update('ldapMaxAttempts', v)}
            onWindowChange={(v) => update('ldapWindowMinutes', v)}
            disabled={!prefs.appRateLimitEnabled}
          />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">MAC Authentication</p>
          <RateRow
            label="MAC Auth Rate Limit"
            description="Max MAC auth attempts per IP within the window"
            attempts={prefs.macAuthMaxAttempts} windowMin={prefs.macAuthWindowMinutes}
            onAttemptsChange={(v) => update('macAuthMaxAttempts', v)}
            onWindowChange={(v) => update('macAuthWindowMinutes', v)}
            disabled={!prefs.appRateLimitEnabled}
          />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Self Registration</p>
          <RateRow
            label="Self Registration Rate Limit"
            description="Max self-registration attempts per IP within the window"
            attempts={prefs.selfRegMaxAttempts} windowMin={prefs.selfRegWindowMinutes}
            onAttemptsChange={(v) => update('selfRegMaxAttempts', v)}
            onWindowChange={(v) => update('selfRegWindowMinutes', v)}
            disabled={!prefs.appRateLimitEnabled}
          />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Open Access</p>
          <RateRow
            label="Open Access Rate Limit"
            description="Max open access requests per IP within the window"
            attempts={prefs.openAccessMaxAttempts} windowMin={prefs.openAccessWindowMinutes}
            onAttemptsChange={(v) => update('openAccessMaxAttempts', v)}
            onWindowChange={(v) => update('openAccessWindowMinutes', v)}
            disabled={!prefs.appRateLimitEnabled}
          />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">OTP — Per Phone</p>
          <RateRow
            label="OTP Send (per Phone)"
            description="Max OTP sends to the same phone number within the window"
            attempts={prefs.otpSendPerPhoneMax} windowMin={prefs.otpSendPerPhoneWindowMinutes}
            onAttemptsChange={(v) => update('otpSendPerPhoneMax', v)}
            onWindowChange={(v) => update('otpSendPerPhoneWindowMinutes', v)}
            disabled={!prefs.appRateLimitEnabled}
          />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">OTP — Per IP</p>
          <RateRow
            label="OTP Send (per IP)"
            description="Max OTP sends from the same IP across all phone numbers"
            attempts={prefs.otpSendPerIpMax} windowMin={prefs.otpSendPerIpWindowMinutes}
            onAttemptsChange={(v) => update('otpSendPerIpMax', v)}
            onWindowChange={(v) => update('otpSendPerIpWindowMinutes', v)}
            disabled={!prefs.appRateLimitEnabled}
          />

          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">OTP Verify</p>
          <NumField
            label="Max Wrong OTP Attempts" description="Maximum incorrect OTP entries before locking"
            value={prefs.otpVerifyMaxAttempts} onChange={(v) => update('otpVerifyMaxAttempts', v)}
            min={1} max={20} disabled={!prefs.appRateLimitEnabled}
          />

          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Brute-Force Lockout Tiers (Portal Frontend)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([1, 2, 3] as const).map((tier) => (
              <div key={tier} className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-medium">Tier {tier}</p>
                <NumField
                  label="Attempts" description={`Trigger after N failures`}
                  value={prefs[`lockoutTier${tier}Attempts` as keyof PortalPreferencesSettings] as number}
                  onChange={(v) => update(`lockoutTier${tier}Attempts` as keyof PortalPreferencesSettings, v)}
                  min={1} max={100} disabled={!prefs.appRateLimitEnabled}
                />
                <NumField
                  label="Lockout" description="Lockout duration"
                  value={prefs[`lockoutTier${tier}Seconds` as keyof PortalPreferencesSettings] as number}
                  onChange={(v) => update(`lockoutTier${tier}Seconds` as keyof PortalPreferencesSettings, v)}
                  min={1} max={3600} suffix="sec" disabled={!prefs.appRateLimitEnabled}
                />
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* ── 2. OTP ── */}
      <SectionCard
        icon={Smartphone} title="OTP Configuration"
        description="One-Time Password generation and validation settings"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <NumField
            label="OTP Code Length"
            description="Number of digits in the OTP code"
            value={prefs.otpCodeLength} onChange={(v) => update('otpCodeLength', v)}
            min={4} max={8}
          />
          <NumField
            label="OTP Expiry"
            description="How long the OTP is valid"
            value={prefs.otpExpirySeconds} onChange={(v) => update('otpExpirySeconds', v)}
            min={30} max={600} suffix="sec"
          />
          <NumField
            label="Max Retries"
            description="Maximum wrong OTP entries before failure"
            value={prefs.otpMaxRetries} onChange={(v) => update('otpMaxRetries', v)}
            min={1} max={10}
          />
        </div>
      </SectionCard>

      {/* ── 5. Auth Defaults ── */}
      <SectionCard
        icon={Key} title="Auth Method Defaults"
        description="Default timeouts and configuration for specific auth methods"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NumField
            label="MAC Auth Validity"
            description="How long a MAC auth entry remains valid"
            value={prefs.macAuthValidityDays} onChange={(v) => update('macAuthValidityDays', v)}
            min={1} max={365} suffix="days"
          />
          <NumField
            label="Social Auth Duration"
            description="Session duration for social login users"
            value={prefs.socialAuthDurationHours} onChange={(v) => update('socialAuthDurationHours', v)}
            min={1} max={720} suffix="hours"
          />
          <NumField
            label="LDAP Timeout"
            description="LDAP connection/search timeout"
            value={prefs.ldapTimeoutSeconds} onChange={(v) => update('ldapTimeoutSeconds', v)}
            min={1} max={120} suffix="sec"
          />
          <NumField
            label="Turnstile Verify Timeout"
            description="Cloudflare CAPTCHA verification timeout"
            value={prefs.turnstileTimeoutMs} onChange={(v) => update('turnstileTimeoutMs', v)}
            min={500} max={10000} suffix="ms"
          />
        </div>
      </SectionCard>

      {/* ── 5. Auto-Auth & Devices ── */}
      <SectionCard
        icon={MonitorSmartphone} title="Auto-Auth & Devices"
        description="Device management and auto-authentication behavior"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NumField
            label="Max Devices per Guest"
            description="Maximum registered devices per guest"
            value={prefs.maxDevicesPerGuest} onChange={(v) => update('maxDevicesPerGuest', v)}
            min={1} max={50}
          />
          <NumField
            label="Device Auto-Cleanup"
            description="Remove inactive device profiles after this many days"
            value={prefs.deviceAutoCleanupDays} onChange={(v) => update('deviceAutoCleanupDays', v)}
            min={1} max={365} suffix="days"
          />
          <FieldGroup
            label="Fingerprint Mismatch Action"
            description="What to do when auto-auth detects a different device fingerprint for the same storageToken"
          >
            <Select
              value={prefs.fingerprintMismatchAction}
              onValueChange={(v) => update('fingerprintMismatchAction', v as 'allow' | 'warn' | 'block')}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow silently</SelectItem>
                <SelectItem value="warn">Warn (log only)</SelectItem>
                <SelectItem value="block">Block & require re-auth</SelectItem>
              </SelectContent>
            </Select>
          </FieldGroup>
        </div>
      </SectionCard>

      {/* ── 7. CNA Detection ── */}
      <SectionCard
        icon={MonitorSmartphone} title="CNA Detection (Captive Network Assistant)"
        description="Control how OS-level captive portal detection behaves"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div>
              <Label className="text-sm font-medium">Enable CNA for Mac Devices</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When ON, macOS/iOS devices see the CNA popup and auto-redirect to the portal.
                When OFF, Mac users must open a browser and navigate to any HTTP URL manually to reach the portal.
              </p>
            </div>
            <Switch
              checked={prefs.cnaEnabledMac}
              onCheckedChange={(v) => update('cnaEnabledMac', v)}
            />
          </div>
        </div>
      </SectionCard>

      {/* Bottom save bar */}
      {hasChanges && (
        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t rounded-lg p-3 flex items-center justify-between shadow-lg">
          <p className="text-sm text-muted-foreground">You have unsaved changes</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PortalPreferencesTab;