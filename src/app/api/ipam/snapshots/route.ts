import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Helper: calculate total IPs from CIDR ────────────────────────
function calculateTotalIps(cidr: string): number {
  const match = cidr.match(/\/(\d+)/);
  if (!match) return 0;
  const prefix = parseInt(match[1], 10);
  if (prefix >= 32) return 1;
  const hostBits = 32 - prefix;
  return Math.max(0, Math.pow(2, hostBits) - 2);
}

// ─── Helper: generate a snapshot from current IPAM state ──────────
async function generateSnapshot(date: Date) {
  const [subnets, ips, vlans] = await Promise.all([
    db.subnet.findMany({ where: { cidr: { not: "" } } }),
    db.ipAddress.findMany(),
    db.vlan.findMany(),
  ]);

  const totalIps = subnets.reduce((sum, sn) => sum + calculateTotalIps(sn.cidr), 0);
  const usedIps = ips.filter((ip) => ip.status === "used").length;
  const reservedIps = ips.filter((ip) => ip.status === "reserved").length;
  const freeIps = totalIps - usedIps - reservedIps;
  const utilizationPct = totalIps > 0 ? Math.round((usedIps / totalIps) * 10000) / 100 : 0;

  // Create snapshot (upsert by date to avoid duplicates)
  const snapshot = await db.ipamSnapshot.upsert({
    where: {
      snapshotDate: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    },
    update: {
      totalSubnets: subnets.length,
      totalIps,
      usedIps,
      reservedIps,
      freeIps: Math.max(0, freeIps),
      utilizationPct,
      totalVlans: vlans.length,
    },
    create: {
      snapshotDate: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      totalSubnets: subnets.length,
      totalIps,
      usedIps,
      reservedIps,
      freeIps: Math.max(0, freeIps),
      utilizationPct,
      totalVlans: vlans.length,
    },
  });

  return snapshot;
}

// ─── GET: Fetch historical utilization snapshots ──────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10), 1), 365);

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    let snapshots = await db.ipamSnapshot.findMany({
      where: { snapshotDate: { gte: since } },
      orderBy: { snapshotDate: "asc" },
    });

    const dataAvailable = snapshots.length > 0;

    const formatted = snapshots.map((s) => ({
      id: s.id,
      date: s.snapshotDate.toISOString().split("T")[0],
      totalSubnets: s.totalSubnets,
      totalIps: s.totalIps,
      usedIps: s.usedIps,
      reservedIps: s.reservedIps,
      freeIps: s.freeIps,
      utilizationPct: s.utilizationPct,
      totalVlans: s.totalVlans,
      cgnatActiveMappings: s.cgnatActiveMappings,
    }));

    return NextResponse.json({ snapshots: formatted, days, dataAvailable });
  } catch (error) {
    console.error("IPAM snapshots GET error:", error);
    return NextResponse.json({ error: "Failed to fetch snapshots" }, { status: 500 });
  }
}

// ─── POST: Generate a new snapshot from current state ─────────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const action = body.action;

    if (action !== "generate") {
      return NextResponse.json({ error: "Unknown action. Use 'generate'." }, { status: 400 });
    }

    const snapshot = await generateSnapshot(new Date());

    return NextResponse.json({
      success: true,
      data: {
        id: snapshot.id,
        date: snapshot.snapshotDate.toISOString().split("T")[0],
        totalSubnets: snapshot.totalSubnets,
        totalIps: snapshot.totalIps,
        usedIps: snapshot.usedIps,
        reservedIps: snapshot.reservedIps,
        freeIps: snapshot.freeIps,
        utilizationPct: snapshot.utilizationPct,
        totalVlans: snapshot.totalVlans,
      },
    });
  } catch (error) {
    console.error("IPAM snapshots POST error:", error);
    return NextResponse.json({ error: "Failed to generate snapshot" }, { status: 500 });
  }
}
