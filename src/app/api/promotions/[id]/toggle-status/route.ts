import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { auditUpdate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

/**
 * POST /api/promotions/[id]/toggle-status
 * Toggles promotion between ACTIVE and EXPIRED.
 * If the promotion is DEPLETED, it cannot be reactivated.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const existing = await db.promotion.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Promotion not found" }, { status: 404 });
    }

    // DEPLETED promotions cannot be reactivated
    if (existing.status === "DEPLETED") {
      return NextResponse.json(
        { error: "Cannot reactivate a depleted promotion. It has reached its usage limit." },
        { status: 400 }
      );
    }

    const newStatus = existing.status === "ACTIVE" ? "EXPIRED" : "ACTIVE";
    const updated = await db.promotion.update({
      where: { id },
      data: { status: newStatus },
    });

    auditUpdate(request, "Promotion", id, { status: newStatus }, { status: existing.status }).catch(() => {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Promotion toggle status error:", error);
    return NextResponse.json({ error: "Failed to toggle promotion status" }, { status: 500 });
  }
}
