"use client";

// ─── Plan Details Sheet (POL-ENGINE-2) ─────────────────────────────
// Shows every detail of a created package: identity, billing scheme,
// policy mappings with summaries, pricing & cycle charging, access /
// session control, expiry behaviour, IP pool, advanced options.

import { useMemo } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Timer, CalendarClock, Gauge, ArrowDownUp, Hourglass, Network,
  Pencil, ShieldCheck, Wallet, Info, Settings, Link2, Users,
} from "lucide-react";
import { formatINR } from "@/lib/utils";

export interface PlanDetail {
  id: string; name: string; description: string; category: string; status: string;
  billingScheme: string; availableFor: string; onlinePurchaseable: boolean;
  downloadSpeed: number; uploadSpeed: number; speedUnit: string;
  downloadSpeedFup: number | null; uploadSpeedFup: number | null;
  dataLimitGb: number | null; validityDays: number;
  priceMonthly: number; priceQuarterly: number | null; priceHalfYearly: number | null; priceYearly: number | null;
  discountAmount: number; discountIsPercent: boolean;
  installationCharge: number; securityDeposit: number; routerRental: number;
  cgstPercent: number; sgstPercent: number; igstPercent: number;
  cycleType: string; billingDay: number | null; cycleMultiplier: number | null;
  cycleAmountBasis: string; quotaChargeBasis: string; cyclePrice: number | null; cycleDays: number | null;
  maxConcurrentSessions: number; macBinding: boolean; priority: number | null;
  idleTimeoutType: string; idleTimeoutMin: number | null;
  expiryBasis: string; fixedExpiryAt: string | null; expireTimeOfDay: string;
  contentionRatio: string; burstSpeed: number | null; burstDuration: number | null;
  freeTrialDays: number; slaUptime: number;
  ipv6Enabled: boolean; ipv6PrefixDelegation: boolean; ipv6AssignmentMode: string;
  isPopular: boolean; sortOrder: number;
  createdAt: string; updatedAt: string;
  _count: { subscribers: number };
  SurfingQuotaPolicy?: { id: string; name: string; quotaType: string; allottedMinutes: number | null; expiryDays: number | null; cycleType: string } | null;
  AccessTimePolicy?: { id: string; name: string; defaultStrategy: string; _count?: { slots: number } } | null;
  BandwidthPolicy?: { id: string; name: string; downloadKbps: number; uploadKbps: number; policyType: string; policyFor: string } | null;
  DataTransferPolicy?: { id: string; name: string; scheme: string; totalLimitMb: number | null; cycleType: string } | null;
  FairAccessPolicy?: { id: string; name: string; fapType: string; dataOn: string; limitMb: number } | null;
  IpPool?: { id: string; name: string; cidr: string; frPoolName: string } | null;
}

function mbToHuman(mb: number | null | undefined): string {
  if (!mb) return "";
  if (mb >= 1024 * 1024) return `${+(mb / (1024 * 1024)).toFixed(2)} TB`;
  if (mb >= 1024) return `${+(mb / 1024).toFixed(2)} GB`;
  return `${mb} MB`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-right min-w-0 break-words">{value ?? "—"}</span>
    </div>
  );
}

function DetailSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="h-6 w-6 rounded-md bg-muted flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="rounded-lg border bg-card p-3 divide-y divide-border/60">
        {children}
      </div>
    </div>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PlanDetailsSheet({
  open, onOpenChange, plan, onEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: PlanDetail | null;
  onEdit: (plan: PlanDetail) => void;
}) {
  const billingDayLabel = useMemo(() => {
    if (!plan) return null;
    if (plan.cycleType === "WEEKLY" && plan.billingDay != null) return WEEKDAYS[(plan.billingDay - 1) % 7];
    if (plan.cycleType === "MONTHLY" && plan.billingDay != null) return `Day ${plan.billingDay}`;
    return null;
  }, [plan]);

  if (!plan) return null;

  const planTypes = (plan.availableFor || "").split(",").map((t) => t.trim()).filter(Boolean);
  const bwMbps = (kbps: number) => `${(kbps / 1024).toFixed(kbps % 1024 === 0 ? 0 : 1)} Mbps`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-4 pb-3 border-b bg-gradient-to-r from-red-50/60 dark:from-red-950/10">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2 text-base">
                <span className="truncate">{plan.name}</span>
                {plan.isPopular && <Badge className="text-[9px] bg-amber-100 text-amber-700 border-amber-200">POPULAR</Badge>}
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-[10px]">{plan.category}</Badge>
                <Badge variant="outline" className={`text-[10px] ${plan.billingScheme === "POSTPAID" ? "border-violet-300 text-violet-700 dark:text-violet-400" : "border-emerald-300 text-emerald-700 dark:text-emerald-400"}`}>
                  {plan.billingScheme}
                </Badge>
                {planTypes.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px] text-muted-foreground">{t.toLowerCase()}</Badge>
                ))}
                <Badge variant={plan.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">{plan.status}</Badge>
              </SheetDescription>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => onEdit(plan)}>
              <Pencil className="h-3.5 w-3.5" />Edit
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Identity */}
            <DetailSection icon={Info} title="Package Identity">
              <Row label="Name" value={plan.name} />
              <Row label="Description" value={plan.description || "—"} />
              <Row label="Online Purchase" value={plan.onlinePurchaseable ? "Allowed" : "Staff only"} />
              <Row label="Subscribers" value={<span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{plan._count.subscribers}</span>} />
              <Row label="Created" value={new Date(plan.createdAt).toLocaleDateString()} />
            </DetailSection>

            {/* Policy mapping */}
            <DetailSection icon={Link2} title="Policy Mapping">
              <Row
                label={<span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" />Surfing Quota</span>}
                value={plan.SurfingQuotaPolicy ? (
                  <span className="flex flex-col items-end">
                    <span>{plan.SurfingQuotaPolicy.name}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {plan.SurfingQuotaPolicy.quotaType === "RATEBASED" ? "Rate-based" : plan.SurfingQuotaPolicy.allottedMinutes == null ? "Unlimited time" : `${Math.round(plan.SurfingQuotaPolicy.allottedMinutes / 60)} h`}
                      {plan.SurfingQuotaPolicy.expiryDays ? ` · ${plan.SurfingQuotaPolicy.expiryDays}d validity` : ""}
                      {plan.SurfingQuotaPolicy.cycleType !== "NONE" ? ` · ${plan.SurfingQuotaPolicy.cycleType.toLowerCase()} reset` : ""}
                    </span>
                  </span>
                ) : "None"}
              />
              <Row
                label={<span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />Access Time</span>}
                value={plan.AccessTimePolicy ? (
                  <span className="flex flex-col items-end">
                    <span>{plan.AccessTimePolicy.name}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {plan.AccessTimePolicy._count?.slots ? `${plan.AccessTimePolicy._count.slots} slots` : "no slots"} · default {plan.AccessTimePolicy.defaultStrategy.toLowerCase()}
                    </span>
                  </span>
                ) : "None"}
              />
              <Row
                label={<span className="inline-flex items-center gap-1"><Gauge className="h-3 w-3" />Bandwidth</span>}
                value={plan.BandwidthPolicy ? (
                  <span className="flex flex-col items-end">
                    <span>{plan.BandwidthPolicy.name}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {bwMbps(plan.BandwidthPolicy.downloadKbps)} ↓ / {bwMbps(plan.BandwidthPolicy.uploadKbps)} ↑ · {plan.BandwidthPolicy.policyType.toLowerCase()} · {plan.BandwidthPolicy.policyFor === "POOL" ? "pool" : "user"}-based
                    </span>
                  </span>
                ) : "None"}
              />
              <Row
                label={<span className="inline-flex items-center gap-1"><ArrowDownUp className="h-3 w-3" />Data Transfer</span>}
                value={plan.DataTransferPolicy ? (
                  <span className="flex flex-col items-end">
                    <span>{plan.DataTransferPolicy.name}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {plan.DataTransferPolicy.scheme === "RATEBASED" ? "Postpaid metered" : plan.DataTransferPolicy.totalLimitMb ? `${mbToHuman(plan.DataTransferPolicy.totalLimitMb)} cap` : "custom limits"}
                      {plan.DataTransferPolicy.cycleType !== "NONE" ? ` · ${plan.DataTransferPolicy.cycleType.toLowerCase()} cycle` : ""}
                    </span>
                  </span>
                ) : "None"}
              />
              <Row
                label={<span className="inline-flex items-center gap-1"><Hourglass className="h-3 w-3" />Fair Access</span>}
                value={plan.FairAccessPolicy ? (
                  <span className="flex flex-col items-end">
                    <span>{plan.FairAccessPolicy.name}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {mbToHuman(plan.FairAccessPolicy.limitMb)} {plan.FairAccessPolicy.dataOn.toLowerCase()} · {plan.FairAccessPolicy.fapType === "RESET" ? "resets" : "non-reset"}
                    </span>
                  </span>
                ) : "None"}
              />
              <Row
                label={<span className="inline-flex items-center gap-1"><Network className="h-3 w-3" />IP Pool</span>}
                value={plan.IpPool ? (
                  <span className="flex flex-col items-end">
                    <span>{plan.IpPool.name}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">{plan.IpPool.cidr}{plan.IpPool.frPoolName ? ` · "${plan.IpPool.frPoolName}"` : ""}</span>
                  </span>
                ) : "Default"}
              />
            </DetailSection>

            {/* Speed & data — rows governed by a mapped policy are shown as
                policy-managed here (the mapping section above carries the
                details) instead of repeating the same values twice */}
            <DetailSection icon={Gauge} title="Speed & Data">
              <Row
                label="Download / Upload"
                value={plan.BandwidthPolicy ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Link2 className="h-3 w-3" />Via “{plan.BandwidthPolicy.name}”</span>
                ) : `${plan.downloadSpeed} / ${plan.uploadSpeed} ${plan.speedUnit}`}
              />
              <Row
                label="FUP Speed"
                value={plan.FairAccessPolicy ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Link2 className="h-3 w-3" />Via “{plan.FairAccessPolicy.name}”</span>
                ) : (plan.downloadSpeedFup || plan.uploadSpeedFup) ? `${plan.downloadSpeedFup ?? "—"}/${plan.uploadSpeedFup ?? "—"} ${plan.speedUnit}` : "Not set"}
              />
              <Row
                label="Data Limit"
                value={plan.DataTransferPolicy ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Link2 className="h-3 w-3" />Via “{plan.DataTransferPolicy.name}”</span>
                ) : plan.FairAccessPolicy ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Link2 className="h-3 w-3" />Via “{plan.FairAccessPolicy.name}” (pre-throttle cap)</span>
                ) : plan.dataLimitGb ? `${plan.dataLimitGb} GB` : "Unlimited"}
              />
              <Row label="Contention Ratio" value={plan.contentionRatio} />
              <Row
                label="Burst"
                value={plan.BandwidthPolicy ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Link2 className="h-3 w-3" />Via “{plan.BandwidthPolicy.name}”</span>
                ) : plan.burstSpeed ? `${plan.burstSpeed} ${plan.speedUnit}${plan.burstDuration ? ` × ${plan.burstDuration}s` : ""}` : "—"}
              />
            </DetailSection>

            {/* Pricing */}
            <DetailSection icon={Wallet} title="Pricing & Charging">
              <Row label="Base Price" value={formatINR(plan.priceMonthly)} />
              {(plan.billingScheme === "PREPAID" || plan.cycleType === "NONE") && (
                <>
                  <Row label="Quarterly / Half-Yearly / Yearly" value={`${plan.priceQuarterly ? formatINR(plan.priceQuarterly) : "—"}` + ` / ${plan.priceHalfYearly ? formatINR(plan.priceHalfYearly) : "—"}` + ` / ${plan.priceYearly ? formatINR(plan.priceYearly) : "—"}`} />
                  <Row label="Validity" value={`${plan.validityDays} days`} />
                </>
              )}
              {plan.billingScheme === "POSTPAID" && (
                <>
                  <Row label="Cycle" value={plan.cycleType === "NONE" ? "No cycle" : `${plan.cycleType.toLowerCase()}${billingDayLabel ? ` · ${billingDayLabel}` : ""}${plan.cycleMultiplier && plan.cycleMultiplier > 1 ? ` · every ${plan.cycleMultiplier} cycles` : ""}`} />
                  <Row label="Cycle Price / Days" value={`${plan.cyclePrice ? formatINR(plan.cyclePrice) : "base"} / ${plan.cycleDays ?? "—"}`} />
                  <Row label="Cycle Amount Basis" value={plan.cycleAmountBasis === "ACTUAL_DAYS" ? "Actual days used" : "Full amount"} />
                  <Row label="Quota Charge Basis" value={plan.quotaChargeBasis === "ACTUAL_DAYS" ? "Actual days used" : "Full amount"} />
                </>
              )}
              <Row label="Discount" value={plan.discountAmount > 0 ? `${formatINR(plan.discountAmount)}${plan.discountIsPercent ? " (%)" : ""}` : "None"} />
              <Row label="GST (C+S+I)" value={`${plan.cgstPercent}% + ${plan.sgstPercent}% + ${plan.igstPercent}%`} />
              <Row label="Install / Deposit / Router" value={`${formatINR(plan.installationCharge)} / ${formatINR(plan.securityDeposit)} / ${formatINR(plan.routerRental)}`} />
            </DetailSection>

            {/* Access & session */}
            <DetailSection icon={ShieldCheck} title="Access & Session Control">
              <Row label="Login Limit" value={`${plan.maxConcurrentSessions} concurrent session${plan.maxConcurrentSessions === 1 ? "" : "s"}`} />
              <Row label="MAC Binding" value={plan.macBinding ? "Enabled" : "Disabled"} />
              <Row
                label="Priority"
                value={plan.BandwidthPolicy ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Link2 className="h-3 w-3" />Via “{plan.BandwidthPolicy.name}”</span>
                ) : plan.priority != null ? `${plan.priority}` : "Inherit"}
              />
              <Row label="Idle Timeout" value={plan.idleTimeoutType === "NONE" ? "None" : `${plan.idleTimeoutMin ?? "—"} min (${plan.idleTimeoutType === "LIVE_REQUEST" ? "live request" : "data transfer"} based)`} />
            </DetailSection>

            {/* Expiry */}
            <DetailSection icon={Settings} title="Expiry Behaviour">
              <Row label="Expire Based On" value={plan.expiryBasis === "GLOBAL" ? "Global (from activation)" : plan.expiryBasis === "FIXED_DATE" ? "Fixed date" : "Fixed date & time"} />
              {plan.expiryBasis !== "GLOBAL" && plan.fixedExpiryAt && (
                <Row label="Fixed Expiry" value={new Date(plan.fixedExpiryAt).toLocaleString()} />
              )}
              <Row label="Expire Time of Day" value={plan.expireTimeOfDay} />
            </DetailSection>

            {/* Advanced */}
            <DetailSection icon={Settings} title="Advanced">
              <Row label="SLA Uptime" value={`${plan.slaUptime}%`} />
              <Row label="Free Trial" value={plan.freeTrialDays > 0 ? `${plan.freeTrialDays} days` : "—"} />
              <Row label="IPv6" value={plan.ipv6Enabled ? `${plan.ipv6AssignmentMode}${plan.ipv6PrefixDelegation ? " + PD" : ""}` : "Disabled"} />
              <Row label="Sort Order" value={String(plan.sortOrder)} />
              <Row label="Last Updated" value={new Date(plan.updatedAt).toLocaleString()} />
            </DetailSection>

            <Separator className="my-2" />
            <p className="text-[10px] text-muted-foreground text-center">All configured values are enforced by the platform policy engine.</p>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
