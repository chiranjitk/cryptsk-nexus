import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// GET /api/dns/zones — list DNS zones
export async function GET() {
  try {
    await requirePermission("network.gateway", "read");
    const zones = await db.dnsZone.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { records: true } } },
    });
    return NextResponse.json({ zones });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/dns/zones — create a DNS zone
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("network.gateway", "create");
    const body = await req.json();
    const { zoneName, zoneType, primaryNs, adminEmail, description } = body;

    if (!zoneName || !primaryNs || !adminEmail) {
      return NextResponse.json({ error: "zoneName, primaryNs, adminEmail required" }, { status: 400 });
    }

    const zone = await db.dnsZone.create({
      data: {
        zoneName, zoneType: zoneType || "forward",
        primaryNs, adminEmail,
        zoneFile: `/var/named/${zoneName}.zone`,
        description,
      },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "dns_zone",
      resourceId: zone.id, resourceName: zone.zoneName,
      after: { zoneName, zoneType, primaryNs },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ zone }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
