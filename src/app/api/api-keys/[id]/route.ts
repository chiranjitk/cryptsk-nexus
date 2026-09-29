import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditUpdate, auditDelete } from "@/lib/audit";

// PATCH /api/api-keys/[id] — revoke a key ({ status: "revoked" })
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("api_key", "manage");
    const { id } = await params;
    const body = await req.json();

    if (body?.status !== "revoked") {
      return NextResponse.json(
        { error: "Only { status: \"revoked\" } is supported — keys cannot be un-revoked" },
        { status: 400 }
      );
    }

    const existing = await db.apiKey.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "API key not found" }, { status: 404 });

    if (existing.status === "revoked") {
      return NextResponse.json({ error: "API key is already revoked" }, { status: 409 });
    }

    const revoked = await db.apiKey.update({
      where: { id },
      data: { status: "revoked", revokedAt: new Date(), revokedBy: user.id },
      select: { id: true, name: true, keyPrefix: true, status: true, revokedAt: true },
    });

    await auditUpdate({
      userId: user.id,
      resource: "api_key",
      resourceId: id,
      resourceName: existing.name,
      before: { status: existing.status },
      after: { status: "revoked" },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ apiKey: revoked });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
  }
}

// DELETE /api/api-keys/[id] — permanently delete a key
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("api_key", "delete");
    const { id } = await params;

    const existing = await db.apiKey.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "API key not found" }, { status: 404 });

    await db.apiKey.delete({ where: { id } });

    await auditDelete({
      userId: user.id,
      resource: "api_key",
      resourceId: id,
      resourceName: existing.name,
      before: { name: existing.name, keyPrefix: existing.keyPrefix, status: existing.status },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
  }
}
