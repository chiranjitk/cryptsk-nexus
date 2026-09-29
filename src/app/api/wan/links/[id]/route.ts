import { NextRequest, NextResponse } from "next/server";
import { WanLinkStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditConfigChange, auditDelete } from "@/lib/audit";

// PATCH /api/wan/links/[id] — update WAN link fields + primary toggle
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("network.device", "update");
    const { id } = await params;
    const body = await req.json();
    const { linkName, interface: iface, ipAddress, gateway, subnet,
            status, isPrimary, weight, latencyMs, packetLoss, description } = body;

    const existing = await db.wanLink.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "WAN link not found" }, { status: 404 });

    if (status && !Object.values(WanLinkStatus).includes(status)) {
      return NextResponse.json({ error: "Invalid status — must be up, down, degraded or backup" }, { status: 400 });
    }
    if (weight !== undefined && (!Number.isInteger(Number(weight)) || Number(weight) < 1)) {
      return NextResponse.json({ error: "weight must be a positive integer" }, { status: 400 });
    }
    if (linkName && linkName !== existing.linkName) {
      const dup = await db.wanLink.findUnique({ where: { linkName } });
      if (dup) return NextResponse.json({ error: "WAN link name already exists" }, { status: 409 });
    }

    const data: Record<string, unknown> = {};
    if (linkName !== undefined) data.linkName = linkName;
    if (iface !== undefined) data.interface = iface;
    if (ipAddress !== undefined) data.ipAddress = ipAddress || null;
    if (gateway !== undefined) data.gateway = gateway || null;
    if (subnet !== undefined) data.subnet = subnet || null;
    if (status !== undefined) data.status = status;
    if (isPrimary !== undefined) data.isPrimary = isPrimary;
    if (weight !== undefined) data.weight = Number(weight);
    if (latencyMs !== undefined) data.latencyMs = latencyMs === null ? null : Number(latencyMs);
    if (packetLoss !== undefined) data.packetLoss = packetLoss === null ? null : Number(packetLoss);
    if (description !== undefined) data.description = description || null;

    const link = await db.wanLink.update({ where: { id }, data });

    await auditConfigChange({
      userId: user.id, action: "config_change", resource: "wan_link",
      resourceId: id, resourceName: link.linkName,
      before: { linkName: existing.linkName, status: existing.status, isPrimary: existing.isPrimary, weight: existing.weight },
      after: { linkName: link.linkName, status: link.status, isPrimary: link.isPrimary, weight: link.weight },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({
      link: {
        ...link,
        rxBytes: link.rxBytes != null ? Number(link.rxBytes) : null,
        txBytes: link.txBytes != null ? Number(link.txBytes) : null,
        rxPackets: link.rxPackets != null ? Number(link.rxPackets) : null,
        txPackets: link.txPackets != null ? Number(link.txPackets) : null,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to update WAN link" }, { status: 500 });
  }
}

// DELETE /api/wan/links/[id] — delete a WAN link
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("network.device", "delete");
    const { id } = await params;

    const existing = await db.wanLink.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "WAN link not found" }, { status: 404 });

    await db.wanLink.delete({ where: { id } });

    await auditDelete({
      userId: user.id, action: "delete", resource: "wan_link",
      resourceId: id, resourceName: existing.linkName,
      before: { linkName: existing.linkName, interface: existing.interface, status: existing.status },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete WAN link" }, { status: 500 });
  }
}
