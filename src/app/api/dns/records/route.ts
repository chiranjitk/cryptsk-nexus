import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// GET /api/dns/records — list DNS records (optionally by zone)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("network.gateway", "read");
    const { searchParams } = new URL(req.url);
    const zoneId = searchParams.get("zoneId") || "";

    const where: Record<string, unknown> = {};
    if (zoneId) where.zoneId = zoneId;

    const records = await db.dnsRecord.findMany({
      where,
      orderBy: { hostname: "asc" },
      include: { zone: { select: { zoneName: true } } },
    });

    return NextResponse.json({ records });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/dns/records — create a DNS record
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("network.gateway", "create");
    const body = await req.json();
    const { zoneId, hostname, recordType, value, ttl, priority, weight, port } = body;

    if (!zoneId || !hostname || !recordType || !value) {
      return NextResponse.json({ error: "zoneId, hostname, recordType, value required" }, { status: 400 });
    }

    const record = await db.dnsRecord.create({
      data: {
        zoneId, hostname, recordType, value,
        ttl: ttl || 300, priority, weight, port,
      },
      include: { zone: { select: { zoneName: true } } },
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
