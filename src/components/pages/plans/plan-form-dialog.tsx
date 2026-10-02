"use client";

// ─── Comprehensive Plan Form (POL-ENGINE-2) ────────────────────────
// Single form that creates/edits a subscriber package end-to-end:
// identity + billing scheme + inline policy mapping (5 families +
// IP pool) + speed/data + pricing & cycle charging + access/session
// control + expiry behaviour + advanced options.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { useModuleStore } from "@/store/module-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Timer, CalendarClock, Gauge, ArrowDownUp, Hourglass, Network, ChevronRight,
  Info, Wallet, ShieldCheck, Settings, Globe, WalletCards, Landmark, Link2, Loader2,
} from "lucide-react";

// ─── Form state ────────────────────────────────────────────────────
export const planFormDefaults = {
  name: "", description: "", category: "FTTH" as string, status: "ACTIVE" as string,
  // billing scheme + availability
  billingScheme: "PREPAID" as string,
  availableFor: ["REGISTRATION", "RENEWAL"] as string[],
  onlinePurchaseable: true,
  // speed & data
  downloadSpeed: 50, uploadSpeed: 50, speedUnit: "MBPS" as string,
  downloadSpeedFup: null as number | null, uploadSpeedFup: null as number | null,
  dataLimitGb: null as number | null, dataLimitUnit: "GB" as string,
  // policy mapping
  surfingQuotaPolicyId: "", accessTimePolicyId: "", bandwidthPolicyId: "",
  dataTransferPolicyId: "", fairAccessPolicyId: "",
  ipPoolId: "",
  // pricing
  priceMonthly: 499, priceQuarterly: null as number | null,
  priceHalfYearly: null as number | null, priceYearly: null as number | null,
  discountAmount: 0, discountIsPercent: false,
  installationCharge: 0, securityDeposit: 0, routerRental: 0,
  cgstPercent: 9, sgstPercent: 9, igstPercent: 0,
  validityDays: 30,
  // postpaid cycle charging
  cycleType: "NONE" as string, billingDay: null as number | null,
  cycleMultiplier: null as number | null,
  cycleAmountBasis: "ACTUAL_DAYS" as string, quotaChargeBasis: "ACTUAL_DAYS" as string,
  cyclePrice: null as number | null, cycleDays: null as number | null,
  // access & session control
  maxConcurrentSessions: 1, macBinding: false,
  priority: null as number | null,
  idleTimeoutType: "NONE" as string, idleTimeoutMin: null as number | null,
  // expiry
  expiryBasis: "GLOBAL" as string, fixedExpiryAt: "" as string,
  expireTimeOfDay: "23:59:59" as string,
  // misc
  contentionRatio: "1:10", isPopular: false, sortOrder: 0,
  burstSpeed: null as number | null, burstDuration: null as number | null,
  freeTrialDays: 0, slaUptime: 99.5,
  ipv6Enabled: false, ipv6PrefixDelegation: false,
  ipv6DefaultPoolId: null as string | null, ipv6AssignmentMode: "SLAAC" as string,
};

export type PlanFormState = typeof planFormDefaults;

// ─── Policy options API types ──────────────────────────────────────
export interface PolicyOptions {
  surfingQuota: { id: string; name: string; quotaType: string; allottedMinutes: number | null; expiryDays: number | null; cycleType: string; summary: string }[];
  accessTime: { id: string; name: string; defaultStrategy: string; slotCount: number; summary: string }[];
  bandwidth: { id: string; name: string; downloadKbps: number; uploadKbps: number; policyType: string; policyFor: string; priority: number; summary: string }[];
  dataTransfer: { id: string; name: string; scheme: string; totalLimitMb: number | null; cycleType: string; expiryDays: number | null; summary: string }[];
  fairAccess: { id: string; name: string; fapType: string; dataOn: string; limitMb: number; resetType: string; summary: string }[];
  ipPools: { id: string; name: string; cidr: string; frPoolName: string; allocationStrategy: string; summary: string }[];
}

// ─── Collapsible section header ────────────────────────────────────
function SectionHeader({
  id, label, icon, expanded, onToggle, extra,
}: {
  id: string; label: string; icon: React.ElementType; expanded: boolean; onToggle: (id: string) => void; extra?: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        className="flex items-center gap-2 py-1 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors min-w-0"
        onClick={() => onToggle(id)}
        aria-expanded={expanded}
      >
        <span className="h-6 w-6 rounded-md flex items-center justify-center bg-muted shrink-0">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </span>
        {label}
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${expanded ? "rotate-90" : ""}`} />
      </button>
      {extra}
    </div>
  );
}

// ─── Policy mapping card ───────────────────────────────────────────
function PolicySelectCard({
  icon: Icon, label, hint, value, onChange, options, loading, accent,
}: {
  icon: React.ElementType; label: string; hint: string; value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string; summary: string }[];
  loading: boolean; accent: string;
}) {
  const selected = options.find((o) => o.id === value);
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2 hover:border-border/80 transition-colors">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium min-w-0">
          <span className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${accent}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="truncate">{label}</span>
        </div>
        {value ? (
          <Badge variant="outline" className="text-[10px] bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 shrink-0">bound</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">none</Badge>
        )}
      </div>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger className="h-9"><SelectValue placeholder="No policy selected" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No policy selected</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              <span className="flex flex-col">
                <span>{o.name}</span>
                <span className="text-[10px] text-muted-foreground">{o.summary}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground truncate" title={selected?.summary || hint}>
        {loading ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Loading…</span> : selected ? selected.summary : hint}
      </p>
    </div>
  );
}

// ─── Main form dialog ──────────────────────────────────────────────
export function PlanFormDialog({
  open, onOpenChange, title, description, form, setForm, onSubmit, isPending, submitLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  form: PlanFormState;
  setForm: React.Dispatch<React.SetStateAction<PlanFormState>>;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { isModuleEnabled } = useModuleStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["setup", "policies", "speed", "pricing", "access"]));
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Policy + pool options
  const { data: opts, isLoading: optsLoading } = useQuery<PolicyOptions>({
    queryKey: ["plan-policy-options"],
    queryFn: () => apiFetch("/api/plans/policy-options"),
    enabled: open,
    staleTime: 30_000,
  });

  const boundCount = ["surfingQuotaPolicyId", "accessTimePolicyId", "bandwidthPolicyId", "dataTransferPolicyId", "fairAccessPolicyId", "ipPoolId"]
    .filter((k) => (form as unknown as Record<string, unknown>)[k]).length;

  const set = (patch: Partial<PlanFormState>) => setForm((f) => ({ ...f, ...patch }));
  const setAvail = (tag: string, checked: boolean) => {
    const next = new Set(form.availableFor);
    if (checked) next.add(tag);
    else next.delete(tag);
    set({ availableFor: Array.from(next) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[980px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-1">
          {/* ═══ 1. PLAN SETUP ═══ */}
          <SectionHeader id="setup" label="Plan Setup" icon={Info} expanded={expanded.has("setup")} onToggle={toggle} />
          {expanded.has("setup") && (
            <div className="space-y-3 pl-1 pb-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Package Name *</Label>
                  <Input placeholder="e.g., Fiber 100 Mbps Unlimited" value={form.name} onChange={(e) => set({ name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Connection Category</Label>
                  <Select value={form.category} onValueChange={(v) => set({ category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FTTH">FTTH (User)</SelectItem>
                      <SelectItem value="LEASED_LINE">Leased Line</SelectItem>
                      <SelectItem value="WIRELESS">Wireless</SelectItem>
                      <SelectItem value="CABLE">Cable</SelectItem>
                      <SelectItem value="HOTSPOT">Hotspot</SelectItem>
                      <SelectItem value="COMBO">Combo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Billing scheme segmented cards */}
              <div className="space-y-1.5">
                <Label>Billing Scheme *</Label>
                <div className="grid grid-cols-2 gap-2 max-w-xl">
                  {([
                    { v: "PREPAID", title: "Prepaid", desc: "Pay first — quota expires on usage or validity" },
                    { v: "POSTPAID", title: "Postpaid", desc: "Metered usage billed on a recurring cycle" },
                  ]).map((s) => (
                    <button
                      key={s.v}
                      type="button"
                      aria-pressed={form.billingScheme === s.v}
                      onClick={() => set({ billingScheme: s.v, cycleType: s.v === "PREPAID" ? "NONE" : form.cycleType === "NONE" ? "MONTHLY" : form.cycleType })}
                      className={`rounded-xl border p-3 text-left transition-all ${form.billingScheme === s.v ? "border-red-500/60 bg-red-50 dark:bg-red-950/20 ring-1 ring-red-500/30" : "hover:border-border"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-3.5 w-3.5 rounded-full border-2 ${form.billingScheme === s.v ? "border-red-600 bg-red-600" : "border-muted-foreground/40"}`} />
                        <span className="text-sm font-semibold">{s.title}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{s.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                {/* Package type checkboxes */}
                <div className="space-y-1.5">
                  <Label>Package Type *</Label>
                  <div className="flex items-center gap-4 h-9">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.availableFor.includes("REGISTRATION")} onCheckedChange={(v) => setAvail("REGISTRATION", v === true)} />
                      Registration
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={form.availableFor.includes("RENEWAL")} onCheckedChange={(v) => setAvail("RENEWAL", v === true)} />
                      Renewal
                    </label>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => set({ status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="ARCHIVED">Archived</SelectItem>
                      <SelectItem value="HIDDEN">Hidden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea placeholder="Plan description shown to staff and subscribers…" value={form.description} onChange={(e) => set({ description: e.target.value })} rows={2} />
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div className="space-y-1.5">
                  <Label>Sort Order</Label>
                  <Input type="number" placeholder="0" value={form.sortOrder} onChange={(e) => set({ sortOrder: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="flex items-end gap-3 pb-0.5">
                  <Switch checked={form.isPopular} onCheckedChange={(v) => set({ isPopular: v })} id="plan-popular" />
                  <Label htmlFor="plan-popular">Mark as Popular</Label>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* ═══ 2. POLICY MAPPING ═══ */}
          <SectionHeader
            id="policies" label="Policy Mapping" icon={Link2} expanded={expanded.has("policies")} onToggle={toggle}
            extra={<Badge variant="outline" className="text-[10px] shrink-0">{boundCount}/6 bound</Badge>}
          />
          {expanded.has("policies") && (
            <div className="pb-3">
              <p className="text-[11px] text-muted-foreground mb-2 pl-1">
                Attach one policy per family — these rules are enforced on every subscriber of this package. Leave &quot;none&quot; to inherit platform defaults.
              </p>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
                <PolicySelectCard
                  icon={Timer} label="Surfing Quota Policy" hint="Allotted browsing hours + validity"
                  value={form.surfingQuotaPolicyId} onChange={(v) => set({ surfingQuotaPolicyId: v })}
                  options={opts?.surfingQuota ?? []} loading={optsLoading}
                  accent="bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
                />
                <PolicySelectCard
                  icon={CalendarClock} label="Access Time Policy" hint="Allowed hours per weekday"
                  value={form.accessTimePolicyId} onChange={(v) => set({ accessTimePolicyId: v })}
                  options={opts?.accessTime ?? []} loading={optsLoading}
                  accent="bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"
                />
                <PolicySelectCard
                  icon={Gauge} label="Bandwidth Policy" hint="Speed cap applied to the plan"
                  value={form.bandwidthPolicyId} onChange={(v) => set({ bandwidthPolicyId: v })}
                  options={opts?.bandwidth ?? []} loading={optsLoading}
                  accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                />
                <PolicySelectCard
                  icon={ArrowDownUp} label="Data Transfer Policy" hint="Volume quota / postpaid metering"
                  value={form.dataTransferPolicyId} onChange={(v) => set({ dataTransferPolicyId: v })}
                  options={opts?.dataTransfer ?? []} loading={optsLoading}
                  accent="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                />
                <PolicySelectCard
                  icon={Hourglass} label="Fair Access Policy" hint="Throttle after data limit (optional)"
                  value={form.fairAccessPolicyId} onChange={(v) => set({ fairAccessPolicyId: v })}
                  options={opts?.fairAccess ?? []} loading={optsLoading}
                  accent="bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                />
                <PolicySelectCard
                  icon={Network} label="IP Pool Binding" hint="Assign addresses from a specific pool"
                  value={form.ipPoolId} onChange={(v) => set({ ipPoolId: v })}
                  options={opts?.ipPools ?? []} loading={optsLoading}
                  accent="bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400"
                />
              </div>
            </div>
          )}

          <Separator />

          {/* ═══ 3. SPEED & DATA ═══ */}
          <SectionHeader id="speed" label="Speed & Data" icon={Gauge} expanded={expanded.has("speed")} onToggle={toggle} />
          {expanded.has("speed") && (
            <div className="space-y-3 pl-1 pb-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label>Download Speed *</Label>
                  <Input type="number" value={form.downloadSpeed} onChange={(e) => set({ downloadSpeed: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Upload Speed</Label>
                  <Input type="number" value={form.uploadSpeed} onChange={(e) => set({ uploadSpeed: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Speed Unit</Label>
                  <Select value={form.speedUnit} onValueChange={(v) => set({ speedUnit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MBPS">Mbps</SelectItem>
                      <SelectItem value="KBPS">Kbps</SelectItem>
                      <SelectItem value="GBPS">Gbps</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data Limit</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Unlimited"
                      value={form.dataLimitUnit === "UNLIMITED" ? "" : (form.dataLimitGb ?? "")}
                      onChange={(e) => set({ dataLimitGb: e.target.value ? parseFloat(e.target.value) : null, dataLimitUnit: e.target.value ? form.dataLimitUnit : "UNLIMITED" })}
                      className="flex-1"
                    />
                    <Select value={form.dataLimitUnit} onValueChange={(v) => set({ dataLimitUnit: v })}>
                      <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GB">GB</SelectItem>
                        <SelectItem value="TB">TB</SelectItem>
                        <SelectItem value="UNLIMITED">∞</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-md bg-muted/50">
                <p className="text-xs font-medium text-muted-foreground mb-2">FUP Speed (after data limit)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">FUP Download Speed</Label>
                    <Input type="number" placeholder="Post-FUP download" value={form.downloadSpeedFup ?? ""} onChange={(e) => set({ downloadSpeedFup: e.target.value ? parseInt(e.target.value) : null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">FUP Upload Speed</Label>
                    <Input type="number" placeholder="Post-FUP upload" value={form.uploadSpeedFup ?? ""} onChange={(e) => set({ uploadSpeedFup: e.target.value ? parseInt(e.target.value) : null })} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* ═══ 4. PRICING ═══ */}
          <SectionHeader id="pricing" label="Pricing & Charging" icon={Wallet} expanded={expanded.has("pricing")} onToggle={toggle} />
          {expanded.has("pricing") && (
            <div className="space-y-3 pl-1 pb-3">
              {form.billingScheme === "PREPAID" ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label>Base Price *</Label>
                      <Input type="number" value={form.priceMonthly} onChange={(e) => set({ priceMonthly: parseFloat(e.target.value) || 0 })} />
                      <p className="text-[10px] text-muted-foreground">Charged at registration / renewal</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Quarterly Price</Label>
                      <Input type="number" placeholder="Optional" value={form.priceQuarterly ?? ""} onChange={(e) => set({ priceQuarterly: e.target.value ? parseFloat(e.target.value) : null })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Half-Yearly Price</Label>
                      <Input type="number" placeholder="Optional" value={form.priceHalfYearly ?? ""} onChange={(e) => set({ priceHalfYearly: e.target.value ? parseFloat(e.target.value) : null })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Yearly Price</Label>
                      <Input type="number" placeholder="Optional" value={form.priceYearly ?? ""} onChange={(e) => set({ priceYearly: e.target.value ? parseFloat(e.target.value) : null })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label>Validity (days) *</Label>
                      <Input type="number" value={form.validityDays} onChange={(e) => set({ validityDays: parseInt(e.target.value) || 30 })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Installation Charge</Label>
                      <Input type="number" value={form.installationCharge} onChange={(e) => set({ installationCharge: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Security Deposit</Label>
                      <Input type="number" value={form.securityDeposit} onChange={(e) => set({ securityDeposit: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Router Rental (/mo)</Label>
                      <Input type="number" value={form.routerRental} onChange={(e) => set({ routerRental: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Postpaid billing schedule */}
                  <div className="p-2.5 rounded-lg border bg-muted/30 space-y-3">
                    <div className="flex items-center gap-2">
                      <WalletCards className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-semibold">Billing Schedule (postpaid)</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1.5">
                        <Label>Cycle Type</Label>
                        <Select value={form.cycleType} onValueChange={(v) => set({ cycleType: v, billingDay: v === "NONE" ? null : form.billingDay })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">No cycle</SelectItem>
                            <SelectItem value="WEEKLY">Weekly</SelectItem>
                            <SelectItem value="MONTHLY">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {form.cycleType === "WEEKLY" && (
                        <div className="space-y-1.5">
                          <Label>Billing Day</Label>
                          <Select value={form.billingDay != null ? String(form.billingDay) : "1"} onValueChange={(v) => set({ billingDay: parseInt(v) })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Sunday</SelectItem>
                              <SelectItem value="2">Monday</SelectItem>
                              <SelectItem value="3">Tuesday</SelectItem>
                              <SelectItem value="4">Wednesday</SelectItem>
                              <SelectItem value="5">Thursday</SelectItem>
                              <SelectItem value="6">Friday</SelectItem>
                              <SelectItem value="7">Saturday</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {form.cycleType === "MONTHLY" && (
                        <div className="space-y-1.5">
                          <Label>Billing Date</Label>
                          <Select value={form.billingDay != null ? String(form.billingDay) : "1"} onValueChange={(v) => set({ billingDay: parseInt(v) })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-56">
                              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                                <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {form.cycleType !== "NONE" && (
                        <div className="space-y-1.5">
                          <Label>Bill Every (cycles)</Label>
                          <Input type="number" min={1} placeholder="1" value={form.cycleMultiplier ?? ""} onChange={(e) => set({ cycleMultiplier: e.target.value ? parseInt(e.target.value) : null })} />
                        </div>
                      )}
                    </div>

                    <Separator className="my-1" />

                    {/* Cycle charging */}
                    <p className="text-xs font-semibold">Cycle Charging</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1.5">
                        <Label>Cycle Price</Label>
                        <Input type="number" placeholder="Same as base price" value={form.cyclePrice ?? ""} onChange={(e) => set({ cyclePrice: e.target.value ? parseFloat(e.target.value) : null })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Cycle Days</Label>
                        <Input type="number" placeholder="e.g. 30" value={form.cycleDays ?? ""} onChange={(e) => set({ cycleDays: e.target.value ? parseInt(e.target.value) : null })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Cycle Amount Based On</Label>
                        <Select value={form.cycleAmountBasis} onValueChange={(v) => set({ cycleAmountBasis: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ACTUAL_DAYS">Actual days used</SelectItem>
                            <SelectItem value="FULL_AMOUNT">Full amount</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Quota Charging Based On</Label>
                        <Select value={form.quotaChargeBasis} onValueChange={(v) => set({ quotaChargeBasis: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ACTUAL_DAYS">Actual days used</SelectItem>
                            <SelectItem value="FULL_AMOUNT">Full amount</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label>Base Price *</Label>
                      <Input type="number" value={form.priceMonthly} onChange={(e) => set({ priceMonthly: parseFloat(e.target.value) || 0 })} />
                      <p className="text-[10px] text-muted-foreground">Fallback when no cycle price set</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Installation Charge</Label>
                      <Input type="number" value={form.installationCharge} onChange={(e) => set({ installationCharge: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Security Deposit</Label>
                      <Input type="number" value={form.securityDeposit} onChange={(e) => set({ securityDeposit: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Router Rental (/mo)</Label>
                      <Input type="number" value={form.routerRental} onChange={(e) => set({ routerRental: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </div>
                </>
              )}

              {/* Discount + taxes */}
              <div className="p-2.5 rounded-lg border bg-muted/30 space-y-3">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-semibold">Discount & Taxes</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label>Discount Amount</Label>
                    <Input type="number" step="0.5" min={0} value={form.discountAmount} onChange={(e) => set({ discountAmount: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="flex items-center gap-2 pb-2">
                    <Switch id="disc-pct" checked={form.discountIsPercent} onCheckedChange={(v) => set({ discountIsPercent: v })} />
                    <Label htmlFor="disc-pct" className="text-xs">{form.discountIsPercent ? "Discount in %" : "Discount in ₹"}</Label>
                  </div>
                  <div className="space-y-1.5">
                    <Label>CGST (%)</Label>
                    <Input type="number" step="0.5" value={form.cgstPercent} onChange={(e) => set({ cgstPercent: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>SGST (%)</Label>
                    <Input type="number" step="0.5" value={form.sgstPercent} onChange={(e) => set({ sgstPercent: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>IGST (%)</Label>
                    <Input type="number" step="0.5" value={form.igstPercent} onChange={(e) => set({ igstPercent: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* ═══ 5. ACCESS & SESSION CONTROL ═══ */}
          <SectionHeader id="access" label="Access & Session Control" icon={ShieldCheck} expanded={expanded.has("access")} onToggle={toggle} />
          {expanded.has("access") && (
            <div className="space-y-3 pl-1 pb-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label>User Login Limit *</Label>
                  <Input type="number" min={1} value={form.maxConcurrentSessions} onChange={(e) => set({ maxConcurrentSessions: parseInt(e.target.value) || 1 })} />
                  <p className="text-[10px] text-muted-foreground">Concurrent sessions per subscriber</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={form.priority != null ? String(form.priority) : "inherit"} onValueChange={(v) => set({ priority: v === "inherit" ? null : parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">Inherit</SelectItem>
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((p) => (
                        <SelectItem key={p} value={String(p)}>{p} {p === 0 ? "(highest)" : p === 7 ? "(lowest)" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch id="online-purchase" checked={form.onlinePurchaseable} onCheckedChange={(v) => set({ onlinePurchaseable: v })} />
                  <Label htmlFor="online-purchase" className="text-xs leading-tight">Available for online purchase</Label>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch id="mac-bind" checked={form.macBinding} onCheckedChange={(v) => set({ macBinding: v })} />
                  <Label htmlFor="mac-bind" className="text-xs leading-tight">Bind to device MAC</Label>
                </div>
              </div>

              {/* Idle timeout */}
              <div className="p-2.5 rounded-lg border bg-muted/30 space-y-2">
                <p className="text-xs font-semibold">Idle Timeout</p>
                <div className="grid md:grid-cols-4 gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label>Timeout Basis</Label>
                    <Select value={form.idleTimeoutType} onValueChange={(v) => set({ idleTimeoutType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">No idle timeout</SelectItem>
                        <SelectItem value="LIVE_REQUEST">Live request based</SelectItem>
                        <SelectItem value="DATA_TRANSFER">Data transfer based</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Timeout (minutes) *</Label>
                    <Input
                      type="number" min={1}
                      placeholder={form.idleTimeoutType === "NONE" ? "—" : "e.g. 30"}
                      disabled={form.idleTimeoutType === "NONE"}
                      value={form.idleTimeoutMin ?? ""}
                      onChange={(e) => set({ idleTimeoutMin: e.target.value ? parseInt(e.target.value) : null })}
                    />
                  </div>
                </div>
              </div>

              {/* Expiry behaviour */}
              <div className="p-2.5 rounded-lg border bg-muted/30 space-y-2">
                <p className="text-xs font-semibold">Expiry Behaviour</p>
                <div className="grid md:grid-cols-4 gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label>Expire Based On</Label>
                    <Select value={form.expiryBasis} onValueChange={(v) => set({ expiryBasis: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GLOBAL">Global (from activation)</SelectItem>
                        <SelectItem value="FIXED_DATE">Fixed date</SelectItem>
                        <SelectItem value="FIXED_DATETIME">Fixed date &amp; time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.expiryBasis !== "GLOBAL" && (
                    <div className="space-y-1.5">
                      <Label>Expiry {form.expiryBasis === "FIXED_DATE" ? "Date" : "Date & Time"}</Label>
                      <Input
                        type={form.expiryBasis === "FIXED_DATE" ? "date" : "datetime-local"}
                        value={form.fixedExpiryAt}
                        onChange={(e) => set({ fixedExpiryAt: e.target.value })}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Expire Time of Day</Label>
                    <Input type="text" placeholder="HH:MM:SS" value={form.expireTimeOfDay} onChange={(e) => set({ expireTimeOfDay: e.target.value })} />
                    <p className="text-[10px] text-muted-foreground">Time of day the package expires</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* ═══ 6. ADVANCED ═══ */}
          <SectionHeader id="advanced" label="Advanced Settings" icon={Settings} expanded={expanded.has("advanced")} onToggle={toggle} />
          {expanded.has("advanced") && (
            <div className="space-y-3 pl-1 pb-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label>Contention Ratio</Label>
                  <Select value={form.contentionRatio} onValueChange={(v) => set({ contentionRatio: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1:4">1:4 (Premium)</SelectItem>
                      <SelectItem value="1:8">1:8 (Standard)</SelectItem>
                      <SelectItem value="1:10">1:10 (Normal)</SelectItem>
                      <SelectItem value="1:16">1:16 (Economy)</SelectItem>
                      <SelectItem value="1:20">1:20 (Budget)</SelectItem>
                      <SelectItem value="1:25">1:25 (Basic)</SelectItem>
                      <SelectItem value="1:50">1:50 (Shared)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Burst Speed ({form.speedUnit})</Label>
                  <Input type="number" placeholder="Optional" value={form.burstSpeed ?? ""} onChange={(e) => set({ burstSpeed: e.target.value ? parseInt(e.target.value) : null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Burst Duration (seconds)</Label>
                  <Input type="number" placeholder="Optional" value={form.burstDuration ?? ""} onChange={(e) => set({ burstDuration: e.target.value ? parseInt(e.target.value) : null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Free Trial Days</Label>
                  <Input type="number" value={form.freeTrialDays} onChange={(e) => set({ freeTrialDays: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label>SLA Uptime (%)</Label>
                  <Input type="number" step="0.1" value={form.slaUptime} onChange={(e) => set({ slaUptime: parseFloat(e.target.value) || 99.5 })} />
                </div>
              </div>
              {isModuleEnabled("ipv6") && <Ipv6Section form={form} set={set} />}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={isPending} className="bg-red-600 hover:bg-red-700 text-white min-w-[140px]">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── IPv6 section (moved from plans page) ──────────────────────────
function Ipv6Section({
  form, set,
}: {
  form: PlanFormState;
  set: (patch: Partial<PlanFormState>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: dhcpv6PoolsData } = useQuery<{ items: { id: string; prefix: string; name: string; description: string }[] }>({
    queryKey: ["dhcpv6-subnets-list"],
    queryFn: () => apiFetch("/api/dhcpv6/subnets?limit=100"),
    enabled: form.ipv6Enabled,
  });
  const dhcpv6Pools = dhcpv6PoolsData?.items ?? [];

  return (
    <>
      <Separator />
      <button
        type="button"
        className="flex items-center justify-between w-full py-1 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <span className="h-5 w-5 rounded flex items-center justify-center bg-muted">
            <Globe className="h-3 w-3 text-muted-foreground" />
          </span>
          IPv6 Configuration
          {form.ipv6Enabled && (
            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">Active</Badge>
          )}
        </span>
        <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="space-y-3 pl-1">
          <div className="flex items-center justify-between">
            <Label>Enable IPv6 for this Plan</Label>
            <Switch checked={form.ipv6Enabled} onCheckedChange={(v) => set({ ipv6Enabled: v })} />
          </div>

          {form.ipv6Enabled && (
            <div className="space-y-3 pl-0.5">
              <Separator className="my-1" />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>IPv6 Prefix Delegation</Label>
                  <p className="text-[11px] text-muted-foreground">Give subscribers a /64 prefix for their home router</p>
                </div>
                <Switch checked={form.ipv6PrefixDelegation} onCheckedChange={(v) => set({ ipv6PrefixDelegation: v })} />
              </div>

              <div className="space-y-1.5">
                <Label>IPv6 Assignment Mode</Label>
                <Select value={form.ipv6AssignmentMode} onValueChange={(v) => set({ ipv6AssignmentMode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SLAAC">SLAAC</SelectItem>
                    <SelectItem value="DHCPV6">DHCPv6</SelectItem>
                    <SelectItem value="PD_ONLY">PD Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Default DHCPv6 Pool</Label>
                <Select value={form.ipv6DefaultPoolId ?? ""} onValueChange={(v) => set({ ipv6DefaultPoolId: v || null })}>
                  <SelectTrigger><SelectValue placeholder="Select a DHCPv6 pool..." /></SelectTrigger>
                  <SelectContent>
                    {dhcpv6Pools.length === 0 && (
                      <SelectItem value="none" disabled>No pools available</SelectItem>
                    )}
                    {dhcpv6Pools.map((pool) => (
                      <SelectItem key={pool.id} value={pool.id}>
                        {pool.prefix} — {pool.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Select a default IPv6 pool for assigning addresses to subscribers on this plan
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
