import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

// GET /api/dhcp/reservations — list static host reservations (filter: ?subnetId)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("dhcp", "list");

    const { searchParams } = new URL(req.url);
    const subnetId = searchParams.get("subnetId") || "";

    const where: Record<string, unknown> = {};
    if (subnetId) where.subnetId = subnetId;

    const reservations = await db.dhcpReservation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { subnet: { select: { subnetName: true, subnet: true, ipType: true } } },
    });

    return NextResponse.json({ reservations });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch DHCP reservations" }, { status: 500 });
  }
}

// POST /api/dhcp/reservations — create a static reservation (Kea host reservation)
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("dhcp", "create");
    const body = await req.json();
    const { subnetId, macAddress, ipAddress, hostname, gateway, dnsServers, description } = body;

    if (!subnetId || !macAddress || !ipAddress) {
      return NextResponse.json({ error: "subnetId, macAddress, ipAddress required" }, { status: 400 });
    }

    const mac = String(macAddress).trim().toUpperCase().replace(/-/g, ":");
    if (!MAC_REGEX.test(mac)) {
      return NextResponse.json({ error: "Invalid MAC address format — expected AA:BB:CC:DD:EE:FF" }, { status: 400 });
    }

    const subnet = await db.dhcpSubnet.findUnique({ where: { id: subnetId } });
    if (!subnet) return NextResponse.json({ error: "DHCP subnet not found" }, { status: 404 });

    const existingMac = await db.dhcpReservation.findUnique({ where: { macAddress: mac } });
    if (existingMac) return NextResponse.json({ error: "MAC address is already reserved" }, { status: 409 });

    const existingIp = await db.dhcpReservation.findUnique({ where: { ipAddress } });
    if (existingIp) return NextResponse.json({ error: "IP address is already reserved" }, { status: 409 });

    const reservation = await db.dhcpReservation.create({
      data: {
        subnetId,
        macAddress: mac,
        ipAddress,
        ipType: subnet.ipType || "ipv4",
        hostname: hostname || null,
        gateway: gateway || null,
        dnsServers: dnsServers || null,
        description: description || null,
      },
      include: { subnet: { select: { subnetName: true, subnet: true, ipType: true } } },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "dhcp_reservation",
      resourceId: reservation.id, resourceName: `${mac} → ${ipAddress}`,
      after: { macAddress: mac, ipAddress, subnetId, hostname },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ reservation }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create DHCP reservation" }, { status: 500 });
  }
}
