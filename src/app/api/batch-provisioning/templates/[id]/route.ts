import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import type { ConnectionType } from "@prisma/client";

// PUT /api/batch-provisioning/templates/:id — Update template
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const { name, description, planId, connectionType, macBinding, autoAssignIp } = body;

    const existing = await db.provisioningTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (planId !== undefined) updateData.planId = planId;
    if (connectionType !== undefined) {
      updateData.connectionType = mapToConnectionType(connectionType);
    }
    if (macBinding !== undefined) updateData.bindToMac = macBinding;
    if (autoAssignIp !== undefined) updateData.autoAssignIp = autoAssignIp;

    const template = await db.provisioningTemplate.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ template });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Template PUT error:", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

// DELETE /api/batch-provisioning/templates/:id — Delete template
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const existing = await db.provisioningTemplate.findUnique({
      where: { id },
      include: { _count: { select: { jobs: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Check for running jobs
    const activeJobs = await db.batchProvisioningJob.count({
      where: { templateId: id, status: { in: ["PENDING", "IN_PROGRESS"] } },
    });
    if (activeJobs > 0) {
      return NextResponse.json(
        { error: `Cannot delete template with ${activeJobs} active job(s). Cancel them first.` },
        { status: 400 }
      );
    }

    await db.provisioningTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Template DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}

function mapToConnectionType(ct: string): ConnectionType {
  switch (ct) {
    case "PPPoE": return "FTTH";
    case "HOTSPOT": return "WIRELESS";
    default: return "FTTH";
  }
}
