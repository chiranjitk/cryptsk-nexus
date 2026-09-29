import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// DELETE /api/radius-attributes/user-attributes/:id — Remove a user attribute
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const existing = await db.userRadiusAttribute.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User attribute not found" }, { status: 404 });
    }

    await db.userRadiusAttribute.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("User attribute DELETE error:", error);
    return NextResponse.json({ error: "Failed to remove user attribute" }, { status: 500 });
  }
}
