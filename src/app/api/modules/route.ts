import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// GET /api/modules — module registry ordered by sortOrder,
// with feature-flag counts where trivially available.
export async function GET(req: NextRequest) {
  try {
    await requirePermission("module", "list");

    const modules = await db.module.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { featureFlags: true } },
      },
    });

    return NextResponse.json({ modules });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch modules" }, { status: 500 });
  }
}
