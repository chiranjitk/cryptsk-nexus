import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array is required" }, { status: 400 });
    }

    if (ids.length > 500) {
      return NextResponse.json({ error: "Maximum 500 items per reorder" }, { status: 400 });
    }

    await Promise.all(
      ids.map((id: string, index: number) =>
        db.area.update({
          where: { id },
          data: { sortOrder: index + 1 },
        })
      )
    );

    auditCreate(request, "Area", "bulk", { action: "reorder", count: ids.length }, { userId }).catch(() => {});

    return NextResponse.json({ success: true, reordered: ids.length });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Area reorder error:", error);
    return NextResponse.json({ error: "Failed to reorder areas" }, { status: 500 });
  }
}
