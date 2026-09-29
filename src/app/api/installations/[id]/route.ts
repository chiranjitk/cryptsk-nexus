import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { auditUpdate } from "@/lib/services/audit-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const installation = await db.installation.findUnique({
      where: { id },
      include: {
        Subscriber: { select: { id: true, name: true, phone: true, email: true, code: true, address: true, Plan: { select: { name: true } } } },
        Technician: { select: { id: true, name: true, phone: true, email: true, status: true, skills: true } },
        Area: { select: { id: true, name: true, code: true } },
        feedbacks: { select: { id: true, rating: true, feedback: true, createdAt: true } },
      },
    });

    if (!installation) {
      return NextResponse.json({ error: "Installation not found" }, { status: 404 });
    }

    // Calculate average rating
    const feedbackList = installation.feedbacks || [];
    const avgRating = feedbackList.length > 0
      ? Math.round((feedbackList.reduce((sum, f) => sum + f.rating, 0) / feedbackList.length) * 10) / 10
      : null;

    return NextResponse.json({ installation, avgRating, feedbackCount: feedbackList.length });
  } catch (error) {
    console.error("Installation GET by ID error:", error);
    return NextResponse.json({ error: "Failed to fetch installation" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    const existing = await db.installation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Installation not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.technicianId !== undefined) updateData.technicianId = body.technicianId;
    if (body.areaId !== undefined) updateData.areaId = body.areaId || null;
    if (body.scheduledDate !== undefined) updateData.scheduledDate = new Date(body.scheduledDate);
    if (body.scheduledTime !== undefined) updateData.scheduledTime = body.scheduledTime;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.checklist !== undefined) updateData.checklist = JSON.stringify(body.checklist);
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.customerSignature !== undefined) updateData.customerSignature = body.customerSignature;
    if (body.estimatedDurationHours !== undefined) updateData.estimatedDurationHours = Number(body.estimatedDurationHours);
    if (body.equipmentIds !== undefined) updateData.equipmentIds = JSON.stringify(body.equipmentIds);
    if (body.cancellationReason !== undefined) updateData.cancellationReason = body.cancellationReason;
    if (body.subscriberId !== undefined) updateData.subscriberId = body.subscriberId;

    // Auto-set completedAt when status changes to COMPLETED
    if (body.status === "COMPLETED" && !existing.completedAt) {
      updateData.completedAt = new Date();
    }

    const installation = await db.installation.update({
      where: { id },
      data: updateData,
      include: {
        Subscriber: { select: { id: true, name: true, phone: true, code: true } },
        Technician: { select: { id: true, name: true, phone: true, status: true } },
        Area: { select: { id: true, name: true, code: true } },
      },
    });

    await auditUpdate(req, "Installation", id, updateData, existing);
    return NextResponse.json({ installation });
  } catch (error: unknown) {
    console.error("Installation PUT error:", error);
    if (error && typeof error === "object" && "statusCode" in error) {
      const err = error as { statusCode: number; message: string };
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: "Failed to update installation" }, { status: 500 });
  }
}
