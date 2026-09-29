import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// GET /api/dhcp/leases — list DHCP leases (from DB — Kea syncs to this)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("network.gateway", "read");
    const { searchParams } = new URL(req.url);
    const ipType = searchParams.get("ipType") || "";
    const state = searchParams.get("state") || "";

    const where: Record<string, unknown> = {};
    if (ipType) where.ipType = ipType;
    if (state) where.state = state;

    const leases = await db.dhcpLease.findMany({
      where,
      orderBy: { leaseStart: "desc" },
      take: 100,
    });

    return NextResponse.json({ leases });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
