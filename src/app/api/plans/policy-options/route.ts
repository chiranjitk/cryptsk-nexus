import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/plans/policy-options — all policy families + IP pools for the
// plan form's inline mapping section. One request instead of six.

function mbToHuman(mb: number | null | undefined): string {
  if (!mb) return "";
  if (mb >= 1024 * 1024) return `${+(mb / (1024 * 1024)).toFixed(2)} TB`;
  if (mb >= 1024) return `${+(mb / 1024).toFixed(2)} GB`;
  return `${mb} MB`;
}

function minutesToHuman(min: number | null | undefined): string {
  if (min == null) return "Unlimited";
  if (min >= 60 * 24) {
    const h = min / 60;
    return `${+h.toFixed(1)} hours/day`;
  }
  return `${min} min`;
}

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  try {
    const [surfingQuota, accessTime, bandwidth, dataTransfer, fairAccess, ipPools] = await Promise.all([
      db.surfingQuotaPolicy.findMany({
        where: { enabled: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, quotaType: true, allottedMinutes: true, expiryDays: true, cycleType: true },
      }),
      db.accessTimePolicy.findMany({
        where: { enabled: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, defaultStrategy: true, _count: { select: { slots: true } } },
      }),
      db.bandwidthPolicy.findMany({
        where: { enabled: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, downloadKbps: true, uploadKbps: true, policyType: true, policyFor: true, priority: true },
      }),
      db.dataTransferPolicy.findMany({
        where: { enabled: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, scheme: true, totalLimitMb: true, downloadLimitMb: true, uploadLimitMb: true, cycleType: true, expiryDays: true },
      }),
      db.fairAccessPolicy.findMany({
        where: { enabled: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, fapType: true, dataOn: true, limitMb: true, resetType: true, switchOverBandwidthPolicy: { select: { name: true, downloadKbps: true } } },
      }),
      db.subnet.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, cidr: true, frPoolName: true, allocationStrategy: true },
      }),
    ]);

    const sq = surfingQuota.map((p) => ({
      ...p,
      summary:
        p.quotaType === "RATEBASED"
          ? `Rate-based · ${minutesToHuman(p.allottedMinutes)}${p.expiryDays ? ` · expires in ${p.expiryDays}d` : ""}`
          : `${p.allottedMinutes == null ? "Unlimited time" : `${Math.round(p.allottedMinutes / 60)} h`} · ${p.expiryDays ? `${p.expiryDays}d validity` : "no expiry"}${p.cycleType !== "NONE" ? ` · ${p.cycleType.toLowerCase()} reset` : ""}`,
    }));

    const at = accessTime.map((p) => ({
      ...p,
      slotCount: p._count.slots,
      summary:
        p._count.slots === 0
          ? `${p.defaultStrategy === "ALLOW" ? "Full access" : "Blocked"} (no slots)`
          : `${p._count.slots} slot${p._count.slots === 1 ? "" : "s"} · default ${p.defaultStrategy === "ALLOW" ? "allow" : "deny"}`,
    }));

    const bw = bandwidth.map((p) => ({
      ...p,
      summary: `${(p.downloadKbps / 1024).toFixed(p.downloadKbps % 1024 === 0 ? 0 : 1)}/${(p.uploadKbps / 1024).toFixed(p.uploadKbps % 1024 === 0 ? 0 : 1)} Mbps · ${p.policyType.toLowerCase()} · ${p.policyFor === "POOL" ? "pool" : "user"}-based · prio ${p.priority}`,
    }));

    const dt = dataTransfer.map((p) => ({
      ...p,
      summary:
        p.scheme === "RATEBASED"
          ? `Postpaid metered${p.cycleType !== "NONE" ? ` · ${p.cycleType.toLowerCase()} billing` : ""}`
          : `${p.totalLimitMb ? `${mbToHuman(p.totalLimitMb)} total` : `${p.downloadLimitMb ? `↓${mbToHuman(p.downloadLimitMb)}` : ""}${p.uploadLimitMb ? ` ↑${mbToHuman(p.uploadLimitMb)}` : ""}`} · ${p.cycleType !== "NONE" ? `${p.cycleType.toLowerCase()} cycle` : "one-shot"}${p.expiryDays ? ` · ${p.expiryDays}d expiry` : ""}`,
    }));

    const fap = fairAccess.map((p) => ({
      ...p,
      summary: `${mbToHuman(p.limitMb)} ${p.dataOn.toLowerCase()} · ${p.fapType === "RESET" ? `resets ${p.resetType.toLowerCase()}` : "non-reset"}${p.switchOverBandwidthPolicy ? ` → throttle to ${(p.switchOverBandwidthPolicy.downloadKbps / 1024).toFixed(0)} Mbps` : " → no switch-over"}`,
    }));

    const pools = ipPools.map((s) => ({
      id: s.id,
      name: s.name,
      cidr: s.cidr,
      frPoolName: s.frPoolName,
      allocationStrategy: s.allocationStrategy,
      summary: `${s.cidr || s.name}${s.frPoolName ? ` · RADIUS pool "${s.frPoolName}"` : ""}`,
    }));

    return NextResponse.json({ surfingQuota: sq, accessTime: at, bandwidth: bw, dataTransfer: dt, fairAccess: fap, ipPools: pools });
  } catch (error) {
    console.error("Plan policy-options GET error:", error);
    return NextResponse.json({ error: "Failed to fetch policy options" }, { status: 500 });
  }
}
