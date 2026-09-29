import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

// POST /api/plans/reorder — Reorder plans by updating sortOrder
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { planIds } = body as { planIds: string[] };

    if (!planIds || !Array.isArray(planIds) || planIds.length === 0) {
      return NextResponse.json({ error: "planIds must be a non-empty array" }, { status: 400 });
    }

    // Update sortOrder for each plan based on its position in the array
    await Promise.all(
      planIds.map((planId, index) =>
        db.plan.update({
          where: { id: planId },
          data: { sortOrder: index + 1 },
        })
      )
    );

    return NextResponse.json({
      success: true,
      message: `${planIds.length} plans reordered`,
    });
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const authErr = error as { statusCode: number; message: string };
      return NextResponse.json({ error: authErr.message }, { status: authErr.statusCode });
    }
    console.error("Plans reorder error:", error);
    return NextResponse.json({ error: "Failed to reorder plans" }, { status: 500 });
  }
}
