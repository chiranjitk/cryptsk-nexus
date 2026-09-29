import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

/**
 * GET /api/complaints/open-count
 * Returns the count of open complaints (OPEN, ASSIGNED, IN_PROGRESS).
 * Used for the sidebar badge.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const count = await db.complaint.count({
      where: {
        status: {
          in: ["OPEN", "ASSIGNED", "IN_PROGRESS"],
        },
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Open complaint count error:", error);
    return NextResponse.json({ count: 0 });
  }
}
