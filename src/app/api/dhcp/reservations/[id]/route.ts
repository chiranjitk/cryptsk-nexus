import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditConfigChange, auditDelete } from "@/lib/audit";

// PATCH /api/dhcp/reservations/[id] — update reservation + enabled toggle
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("dhcp", "update");
    const { id } = await params;
    const body = await req.json();
    const { hostname, isActive, description } = body;

    const existing = await db.dhcpReservation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "DHCP reservation not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (hostname !== undefined) data.hostname = hostname || null;
    if (isActive !== undefined) data.isActive = isActive;
    if (description !== undefined) data.description = description || null;

    const reservation = await db.dhcpReservation.update({
      where: { id },
      data,
      include: { subnet: { select: { subnetName: true, subnet: true, ipType: true } } },
    });

    await auditConfigChange({
      userId: user.id, action: "config_change", resource: "dhcp_reservation",
      resourceId: id, resourceName: `${existing.macAddress} → ${existing.ipAddress}`,
      before: { hostname: existing.hostname, isActive: existing.isActive },
      after: { hostname: reservation.hostname, isActive: reservation.isActive },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ reservation });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to update DHCP reservation" }, { status: 500 });
  }
}

// DELETE /api/dhcp/reservations/[id] — delete a reservation
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("dhcp", "delete");
    const { id } = await params;

    const existing = await db.dhcpReservation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "DHCP reservation not found" }, { status: 404 });

    await db.dhcpReservation.delete({ where: { id } });

    await auditDelete({
      userId: user.id, action: "delete", resource: "dhcp_reservation",
      resourceId: id, resourceName: `${existing.macAddress} → ${existing.ipAddress}`,
      before: { macAddress: existing.macAddress, ipAddress: existing.ipAddress, subnetId: existing.subnetId },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete DHCP reservation" }, { status: 500 });
  }
}
