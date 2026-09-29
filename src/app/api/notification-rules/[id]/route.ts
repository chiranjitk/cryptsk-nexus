import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// PUT /api/notification-rules/[id] - Update notification rule
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();
    const { name, triggerEvent, channel, message, isActive, templateId } = body;

    const existing = await db.notificationRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const rule = await db.notificationRule.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(triggerEvent !== undefined && { triggerEvent: triggerEvent }),
        ...(channel !== undefined && { channel: channel }),
        ...(templateId !== undefined && { templateId: templateId }),
        ...(message !== undefined && { message: message }),
        ...(isActive !== undefined && { isActive: isActive }),
      },
    });

    return NextResponse.json({ rule });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Failed to update notification rule" }, { status: 500 });
  }
}

// DELETE /api/notification-rules/[id] - Delete notification rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const existing = await db.notificationRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    await db.notificationRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Failed to delete notification rule" }, { status: 500 });
  }
}
