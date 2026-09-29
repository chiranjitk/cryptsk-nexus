import { NextRequest, NextResponse } from "next/server";
import { WanLinkStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// BigInt fields cannot pass through NextResponse.json — convert to Number
function serializeLink(link: any) {
  return {
    ...link,
    rxBytes: link.rxBytes != null ? Number(link.rxBytes) : null,
    txBytes: link.txBytes != null ? Number(link.txBytes) : null,
    rxPackets: link.rxPackets != null ? Number(link.rxPackets) : null,
    txPackets: link.txPackets != null ? Number(link.txPackets) : null,
  };
}

// GET /api/wan/links — list Multi-WAN uplinks (filter: ?status)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("network.device", "list");

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";

    const where: Record<string, unknown> = {};
    if (status) {
      if (!Object.values(WanLinkStatus).includes(status as WanLinkStatus)) {
        return NextResponse.json({ error: "Invalid status — must be up, down, degraded or backup" }, { status: 400 });
      }
      where.status = status as WanLinkStatus;
    }

    const links = await db.wanLink.findMany({
      where,
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ links: links.map(serializeLink) });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch WAN links" }, { status: 500 });
  }
}

// POST /api/wan/links — create a WAN uplink
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("network.device", "create");
    const body = await req.json();
    const { linkName, interface: iface, ipAddress, gateway, subnet,
            status, isPrimary, weight, description } = body;

    if (!linkName || !iface) {
      return NextResponse.json({ error: "linkName and interface required" }, { status: 400 });
    }
    if (status && !Object.values(WanLinkStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status — must be up, down, degraded or backup" }, { status: 400 });
    }
    if (weight !== undefined && (!Number.isInteger(Number(weight)) || Number(weight) < 1)) {
      return NextResponse.json({ error: "weight must be a positive integer" }, { status: 400 });
    }

    const existing = await db.wanLink.findUnique({ where: { linkName } });
    if (existing) return NextResponse.json({ error: "WAN link name already exists" }, { status: 409 });

    const link = await db.wanLink.create({
      data: {
        linkName, interface: iface,
        ipAddress: ipAddress || null, gateway: gateway || null, subnet: subnet || null,
        status: status || "down",
        isPrimary: Boolean(isPrimary),
        weight: weight !== undefined && weight !== "" ? Number(weight) : 1,
        description: description || null,
      },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "wan_link",
      resourceId: link.id, resourceName: link.linkName,
      after: { linkName, interface: iface, status: link.status, isPrimary: link.isPrimary, weight: link.weight },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ link: serializeLink(link) }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create WAN link" }, { status: 500 });
  }
}
