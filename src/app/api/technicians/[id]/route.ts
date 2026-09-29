import { db } from "@/lib/db";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import bcrypt from "bcryptjs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;

    const technician = await db.technician.findUnique({
      where: { id },
      include: {
        User: { select: { id: true, email: true, status: true, lastLoginAt: true } },
        areasManaged: { select: { id: true, name: true, code: true } },
        Complaint: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            Subscriber: { select: { id: true, name: true, code: true } },
            areasManaged: { select: { id: true, name: true } },
          },
        },
        installations: {
          orderBy: { scheduledDate: "desc" },
          take: 20,
          include: {
            Subscriber: { select: { id: true, name: true, code: true } },
            areasManaged: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!technician) {
      return NextResponse.json({ error: "Technician not found" }, { status: 404 });
    }

    // Compute performance stats
    const resolvedComplaints = await db.complaint.count({
      where: { assignedToId: id, status: "RESOLVED" },
    });
    const totalComplaints = await db.complaint.count({
      where: { assignedToId: id },
    });
    const completedInstallations = await db.installation.count({
      where: { technicianId: id, status: "COMPLETED" },
    });
    const totalInstallations = await db.installation.count({
      where: { technicianId: id },
    });

    // Average resolution time from resolved complaints
    const resolvedWithDates = await db.complaint.findMany({
      where: {
        assignedToId: id,
        status: "RESOLVED",
        resolvedAt: { not: null },
      },
      select: { createdAt: true, resolvedAt: true },
    });
    let avgResolutionMinutes = 0;
    if (resolvedWithDates.length > 0) {
      const totalMinutes = resolvedWithDates.reduce((sum, c) => {
        if (c.resolvedAt) {
          return sum + (c.resolvedAt.getTime() - c.createdAt.getTime()) / 60000;
        }
        return sum;
      }, 0);
      avgResolutionMinutes = Math.round(totalMinutes / resolvedWithDates.length);
    }

    return NextResponse.json({
      technician,
      stats: {
        resolvedComplaints,
        totalComplaints,
        completedInstallations,
        totalInstallations,
        avgResolutionMinutes,
        rating: technician.rating,
      },
    });
  } catch (error) {
    console.error("Technician GET by ID error:", error);
    return NextResponse.json({ error: "Failed to fetch technician" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;
    const body = await req.json();

    const existing = await db.technician.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Technician not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.skills !== undefined) updateData.skills = JSON.stringify(body.skills);
    if (body.areas !== undefined) updateData.areas = JSON.stringify(body.areas);
    if (body.status !== undefined) updateData.status = body.status;
    if (body.rating !== undefined) updateData.rating = body.rating;
    if (body.avgResolutionTime !== undefined) updateData.avgResolutionTime = body.avgResolutionTime;
    if (body.currentLocation !== undefined) updateData.currentLocation = body.currentLocation;
    if (body.workingHoursStart !== undefined) updateData.workingHoursStart = body.workingHoursStart;
    if (body.workingHoursEnd !== undefined) updateData.workingHoursEnd = body.workingHoursEnd;
    if (body.daysOff !== undefined) updateData.daysOff = JSON.stringify(body.daysOff);
    if (body.monthlySalary !== undefined) updateData.monthlySalary = body.monthlySalary;
    if (body.bankAccountName !== undefined) updateData.bankAccountName = body.bankAccountName;
    if (body.bankAccountNumber !== undefined) updateData.bankAccountNumber = body.bankAccountNumber;
    if (body.bankIfscCode !== undefined) updateData.bankIfscCode = body.bankIfscCode;
    if (body.certifications !== undefined) updateData.certifications = JSON.stringify(body.certifications);
    if (body.compensation !== undefined) updateData.compensation = JSON.stringify(body.compensation);
    if (body.paymentMode !== undefined) updateData.paymentMode = body.paymentMode;

    // Update linked user if name/email changed
    if (body.name || body.email) {
      const userData: Record<string, unknown> = {};
      if (body.name) userData.name = body.name;
      if (body.email) userData.email = body.email;
      await db.user.update({ where: { id: existing.userId }, data: userData });
    }

    const technician = await db.technician.update({
      where: { id },
      data: updateData,
      include: {
        User: { select: { id: true, email: true, status: true } },
        _count: { select: { Complaint: true, installations: true } },
      },
    });

    await auditUpdate(req, "Technician", id, updateData, existing);
    return NextResponse.json({ technician });
  } catch (error) {
    console.error("Technician PUT error:", error);
    return NextResponse.json({ error: "Failed to update technician" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;

    const existing = await db.technician.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Technician not found" }, { status: 404 });
    }

    // Check if technician has active assignments
    const activeComplaints = await db.complaint.count({
      where: { assignedToId: id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
    });
    if (activeComplaints > 0) {
      return NextResponse.json(
        { error: "Cannot delete technician with active complaints" },
        { status: 400 }
      );
    }

    const deletedRecord = { ...existing };
    await db.technician.delete({ where: { id } });
    await auditDelete(req, "Technician", id, deletedRecord);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Technician DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete technician" }, { status: 500 });
  }
}

// POST /api/technicians/[id] - Create login account for technician
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const { id } = await params;

    const technician = await db.technician.findUnique({ where: { id } });
    if (!technician) {
      return NextResponse.json({ error: "Technician not found" }, { status: 404 });
    }

    // Check if user already has a login
    const existingUser = await db.user.findUnique({ where: { id: technician.userId } });
    if (existingUser && existingUser.password && existingUser.password !== "") {
      return NextResponse.json({ error: "Login account already exists for this technician" }, { status: 400 });
    }

    // Generate email if not exists
    const email = technician.email || `${technician.name.toLowerCase().replace(/\s+/g, ".")}@cryptsk.local`;
    const defaultPassword = "Tech@" + crypto.randomBytes(4).toString("hex");
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);

    const user = await db.user.update({
      where: { id: technician.userId },
      data: {
        email,
        password: hashedPassword,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Login account created successfully. The default password should be communicated to the technician via a secure channel.",
      User: { id: user.id, email: user.email, role: user.role },
    });
  } catch (error: unknown) {
    console.error("Technician create-login error:", error);
    const msg = error instanceof Error && error.message.includes("Authentication") ? error.message : "Failed to create login account";
    const status = error instanceof Error && error.message.includes("401") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
