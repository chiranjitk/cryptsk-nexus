import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// GET /api/dhcp/subnets — list all DHCP subnets (IPv4 + IPv6)
export async function GET() {
  try {
    await requirePermission("network.gateway", "read");
    const subnets = await db.dhcpSubnet.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { reservations: true, leases: true } },
      },
    });
    return NextResponse.json({ subnets });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/dhcp/subnets — create a new DHCP subnet
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("network.gateway", "create");
    const body = await req.json();
    const { subnetName, subnet, ipType, poolStart, poolEnd, gateway,
            dnsServers, validLifetime, interface: iface, vlanId, description } = body;

    if (!subnetName || !subnet || !poolStart || !poolEnd) {
      return NextResponse.json({ error: "subnetName, subnet, poolStart, poolEnd required" }, { status: 400 });
    }

    const subnetRecord = await db.dhcpSubnet.create({
      data: {
        subnetName, subnet, ipType: ipType || "ipv4",
        poolStart, poolEnd, gateway, dnsServers,
        validLifetime: validLifetime || 3600,
        interface: iface || null, vlanId: vlanId || null,
        description,
      },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "dhcp_subnet",
      resourceId: subnetRecord.id, resourceName: subnetRecord.subnetName,
      after: { subnet, poolStart, poolEnd, ipType },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ subnet: subnetRecord }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
