import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/notification-rules
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");

    const where: Record<string, unknown> = {};
    if (isActive === "true") where.isActive = true;
    if (isActive === "false") where.isActive = false;

    const rules = await db.notificationRule.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ rules });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch notification rules" }, { status: 500 });
  }
}

// POST /api/notification-rules
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { name, triggerEvent, channel, message, isActive, templateId } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Rule name is required" }, { status: 400 });

    const rule = await db.notificationRule.create({
      data: {
        name: name.trim(),
        triggerEvent: triggerEvent || "",
        channel: channel || "IN_APP",
        templateId: templateId || "",
        message: message || "",
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to create notification rule" }, { status: 500 });
  }
}

// PUT /api/notification-rules
export async function PUT(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });

    const existing = await db.notificationRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

    const rule = await db.notificationRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.triggerEvent !== undefined && { triggerEvent: data.triggerEvent }),
        ...(data.channel !== undefined && { channel: data.channel }),
        ...(data.templateId !== undefined && { templateId: data.templateId }),
        ...(data.message !== undefined && { message: data.message }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return NextResponse.json({ rule });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to update notification rule" }, { status: 500 });
  }
}

// DELETE /api/notification-rules
export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });

    await db.notificationRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to delete notification rule" }, { status: 500 });
  }
}
