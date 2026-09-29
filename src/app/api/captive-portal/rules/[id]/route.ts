import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// PUT /api/captive-portal/rules/[id] — Update access rule
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.portalAccessRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    const allowedFields = [
      "name", "description", "enabled", "priority", "condition", "actions", "stopOnMatch",
    ] as const;
    for (const key of allowedFields) {
      if (body[key] !== undefined) data[key] = body[key];
    }

    const rule = await db.portalAccessRule.update({
      where: { id },
      data,
    });

    return NextResponse.json({ rule });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Rules] PUT [id] error:", error);
    return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
  }
}

// DELETE /api/captive-portal/rules/[id] — Delete access rule
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(_req);
    const { id } = await params;

    const existing = await db.portalAccessRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    await db.portalAccessRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Rules] DELETE [id] error:", error);
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }
}
