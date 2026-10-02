import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request as unknown as import("next/server").NextRequest);
    const { id } = await params;

    const announcement = await db.announcement.findUnique({ where: { id } });
    if (!announcement) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }

    return NextResponse.json({ announcement });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Announcement GET by ID error:", error);
    return NextResponse.json({ error: "Failed to fetch announcement" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(request as unknown as import("next/server").NextRequest);
    const { id } = await params;

    const existing = await db.announcement.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }

    const body = await request.json();
    const { title, message, type, priority, target, channels, expiresAt, isActive } = body;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (message !== undefined) updateData.message = message.trim();
    if (type !== undefined) updateData.type = type;
    if (priority !== undefined) updateData.priority = priority;
    if (target !== undefined) updateData.target = target;
    if (channels !== undefined) {
      updateData.channels = Array.isArray(channels) ? channels.join(",") : channels;
    }
    if (expiresAt !== undefined) {
      updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }
    if (isActive !== undefined) updateData.isActive = isActive;

    const announcement = await db.announcement.update({
      where: { id },
      data: updateData,
    });

    await auditLog(
      request as unknown as import("next/server").NextRequest,
      "UPDATE",
      "Announcement",
      id,
      updateData,
      { title: existing.title, type: existing.type, priority: existing.priority, target: existing.target, isActive: existing.isActive },
      { userId }
    );

    return NextResponse.json({ announcement });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Announcement PUT error:", error);
    return NextResponse.json({ error: "Failed to update announcement" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(request as unknown as import("next/server").NextRequest);
    const { id } = await params;

    const existing = await db.announcement.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }

    // Soft delete: set isActive to false
    const announcement = await db.announcement.update({
      where: { id },
      data: { isActive: false },
    });

    await auditLog(
      request as unknown as import("next/server").NextRequest,
      "DELETE",
      "Announcement",
      id,
      { deleted: { title: existing.title, type: existing.type } },
      { userId }
    );

    return NextResponse.json({ announcement });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Announcement DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete announcement" }, { status: 500 });
  }
}
