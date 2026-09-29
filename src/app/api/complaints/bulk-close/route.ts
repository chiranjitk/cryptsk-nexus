import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditUpdate } from "@/lib/services/audit-service";
import { requireAuth } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { ids } = body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Complaint IDs are required" }, { status: 400 });
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: "Maximum 100 complaints can be closed at once" }, { status: 400 });
    }

    // Find all complaints and validate they can be closed
    const complaints = await db.complaint.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, assignedToId: true, resolvedAt: true },
    });

    const closableIds: string[] = [];
    const alreadyClosedIds: string[] = [];

    for (const c of complaints) {
      if (c.status === "CLOSED") {
        alreadyClosedIds.push(c.id);
      } else if (c.status === "RESOLVED") {
        closableIds.push(c.id);
      } else if (["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"].includes(c.status)) {
        closableIds.push(c.id);
      }
    }

    if (closableIds.length === 0) {
      return NextResponse.json({
        message: "No closable complaints found",
        closed: 0,
        skipped: alreadyClosedIds.length,
      });
    }

    const now = new Date();

    // Batch update all closable complaints
    const result = await db.complaint.updateMany({
      where: { id: { in: closableIds } },
      data: {
        status: "CLOSED",
        resolvedAt: now,
      },
    });

    // Update technician stats for complaints that weren't previously resolved
    const techIdsToIncrement = new Set<string>();
    for (const c of complaints) {
      if (closableIds.includes(c.id) && c.assignedToId && !c.resolvedAt) {
        techIdsToIncrement.add(c.assignedToId);
      }
    }
    for (const techId of techIdsToIncrement) {
      await db.technician.update({
        where: { id: techId },
        data: { totalResolved: { increment: 1 } },
      });
    }

    // Audit log
    for (const id of closableIds) {
      const existing = complaints.find((c) => c.id === id);
      await auditUpdate(
        req,
        "Complaint",
        id,
        { status: "CLOSED", resolvedAt: now },
        existing || { status: "unknown" },
        { userId }
      );
    }

    return NextResponse.json({
      message: `Successfully closed ${result.count} complaints`,
      closed: result.count,
      skipped: alreadyClosedIds.length,
    });
  } catch (error) {
    console.error("Bulk close error:", error);
    return NextResponse.json({ error: "Failed to bulk close complaints" }, { status: 500 });
  }
}
