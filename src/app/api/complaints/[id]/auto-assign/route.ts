import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const { id } = await params;

    // Fetch complaint with area info
    const complaint = await db.complaint.findUnique({
      where: { id },
      include: {
        Area: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    if (!complaint) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    if (!complaint.areaId) {
      return NextResponse.json(
        { error: "Complaint has no area assigned. Set an area first." },
        { status: 400 }
      );
    }

    if (complaint.status === "RESOLVED" || complaint.status === "CLOSED") {
      return NextResponse.json(
        { error: "Cannot assign to resolved or closed complaints" },
        { status: 400 }
      );
    }

    // Find available technicians whose areas include this complaint's area
    // The `areas` field is a JSON string array like '["area-id-1", "area-id-2"]'
    const allTechnicians = await db.technician.findMany({
      where: { status: "available" },
      include: {
        _count: {
          select: {
            Complaint: {
              where: {
                status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
              },
            },
          },
        },
      },
    });

    // Filter technicians whose `areas` field includes the complaint's areaId
    // areas is stored as JSON string like '["areaId1", "areaId2"]'
    const matchingTechnicians = allTechnicians.filter((tech) => {
      try {
        const techAreas: string[] = JSON.parse(tech.areas || "[]");
        return techAreas.includes(complaint.areaId!);
      } catch {
        return false;
      }
    });

    if (matchingTechnicians.length === 0) {
      return NextResponse.json(
        { error: "No available technician found for this area" },
        { status: 404 }
      );
    }

    // Sort by least number of open complaints
    matchingTechnicians.sort(
      (a, b) => a._count.Complaint - b._count.Complaint
    );

    const bestTech = matchingTechnicians[0];

    // Update the complaint
    const updated = await db.complaint.update({
      where: { id },
      data: {
        assignedToId: bestTech.id,
        status: "ASSIGNED",
        slaDeadline: complaint.slaDeadline || new Date(complaint.createdAt.getTime() + complaint.slaHours * 60 * 60 * 1000),
      },
      include: {
        Subscriber: { select: { id: true, name: true, phone: true, code: true } },
        Area: { select: { id: true, name: true, code: true } },
        assignedTo: { select: { id: true, name: true, phone: true, status: true } },
      },
    });

    // Log status change
    await auditLog(req, "STATUS_CHANGE", "Complaint", id, {
      details: {
        from: complaint.status,
        to: "ASSIGNED",
        autoAssigned: true,
        technicianId: bestTech.id,
        technicianName: bestTech.name,
      },
    });

    // Log assignment
    await auditLog(req, "UPDATE", "Complaint", id, {
      details: {
        assignedToId: bestTech.id,
        assignedToName: bestTech.name,
        status: "ASSIGNED",
        autoAssigned: true,
      },
      previousValues: complaint,
      userId,
    });

    return NextResponse.json({
      complaint: updated,
      Technician: { id: bestTech.id, name: bestTech.name },
      message: `Auto-assigned to ${bestTech.name}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("401")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Auto-assign error:", error);
    return NextResponse.json({ error: "Failed to auto-assign" }, { status: 500 });
  }
}
