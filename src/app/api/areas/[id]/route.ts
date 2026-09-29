import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(_request);
    const { id } = await params;
    const area = await db.area.findUnique({
      where: { id },
      include: {
        Technician: { select: { id: true, name: true, phone: true } },
        CollectionAgent: { select: { id: true, name: true } },
        _count: { select: { Subscriber: true, NetworkDevice: true, Complaint: true, Installation: true } },
    },
    });
    if (!area) {
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    }

    const { searchParams } = new URL(_request.url);
    const includeStats = searchParams.get("stats") === "true";

    let stats: { subscriberCount: number; deviceCount: number; complaintCount: number; openComplaints: number; totalRevenue: number; activeSubs: number } | null = null;
    if (includeStats) {
      const [subCount, deviceCount, complaintCount, openComplaints, totalRevenue, activeSubs] = await Promise.all([
        db.subscriber.count({ where: { areaId: id } }),
        db.networkDevice.count({ where: { areaId: id } }),
        db.complaint.count({ where: { areaId: id } }),
        db.complaint.count({ where: { areaId: id, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } } }),
        db.invoice.aggregate({ where: { Subscriber: { areaId: id }, status: "PAID" }, _sum: { grandTotal: true } }),
        db.subscriber.count({ where: { areaId: id, status: "ACTIVE" } }),
      ]);
      stats = { subscriberCount: subCount, deviceCount, complaintCount, openComplaints, totalRevenue: totalRevenue._sum.grandTotal || 0, activeSubs };
    }

    return NextResponse.json({ ...Area, stats });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Area get error:", error);
    return NextResponse.json({ error: "Failed to fetch area" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.area.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    }

    // Validate name
    if (body.name !== undefined && (!body.name || !String(body.name).trim())) {
      return NextResponse.json({ error: "Area name is required" }, { status: 400 });
    }

    // Uniqueness check if code changed
    const newCode = body.code !== undefined ? String(body.code).trim().toUpperCase() : existing.code;
    if (newCode !== existing.code) {
      const duplicate = await db.area.findUnique({ where: { code: newCode } });
      if (duplicate) {
        return NextResponse.json({ error: "Area with this code already exists" }, { status: 409 });
      }
    }

    // Validate lat/long
    if (body.latitude !== undefined && body.latitude !== null && (body.latitude < -90 || body.latitude > 90)) {
      return NextResponse.json({ error: "Latitude must be between -90 and 90" }, { status: 400 });
    }
    if (body.longitude !== undefined && body.longitude !== null && (body.longitude < -180 || body.longitude > 180)) {
      return NextResponse.json({ error: "Longitude must be between -180 and 180" }, { status: 400 });
    }

    const updated = await db.area.update({
      where: { id },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : existing.name,
        code: newCode,
        description: body.description !== undefined ? String(body.description) : existing.description,
        assignedTechnicianId: body.assignedTechnicianId && body.assignedTechnicianId !== "none" ? body.assignedTechnicianId : null,
        assignedAgentId: body.assignedAgentId && body.assignedAgentId !== "none" ? body.assignedAgentId : null,
        latitude: body.latitude !== undefined && body.latitude !== null ? Number(body.latitude) : existing.latitude,
        longitude: body.longitude !== undefined && body.longitude !== null ? Number(body.longitude) : existing.longitude,
        status: body.status !== undefined ? body.status : existing.status,
        parentId: body.parentId !== undefined ? (body.parentId && body.parentId !== "none" ? body.parentId : null) : existing.parentId,
      },
    });

    auditUpdate(request, "Area", id, { name: updated.name, code: updated.code }, { name: existing.name, code: existing.code }).catch(() => {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Area update error:", error);
    return NextResponse.json({ error: "Failed to update area" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const existing = await db.area.findUnique({
      where: { id },
      include: {
        _count: { select: { Subscriber: true, NetworkDevice: true, Complaint: true, Installation: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Area not found" }, { status: 404 });
    }

    // Protect against deleting area with linked data
    const linked: string[] = [];
    if (existing._count.Subscriber > 0) linked.push(`${existing._count.Subscriber} subscriber(s)`);
    if (existing._count.NetworkDevice > 0) linked.push(`${existing._count.NetworkDevice} device(s)`);
    if (existing._count.Complaint > 0) linked.push(`${existing._count.Complaint} complaint(s)`);
    if (existing._count.Installation > 0) linked.push(`${existing._count.Installation} installation(s)`);

    if (linked.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete: this area has ${linked.join(", ")}.` },
        { status: 409 }
      );
    }

    auditDelete(request, "Area", id, { name: existing.name, code: existing.code }).catch(() => {});
    await db.area.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Area delete error:", error);
    return NextResponse.json({ error: "Failed to delete area" }, { status: 500 });
  }
}
