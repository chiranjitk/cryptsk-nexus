import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

// POST /api/installations/feedback — Submit feedback for a completed installation
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { installationId, rating, feedback } = body;

    if (!installationId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Installation ID and rating (1-5) are required" }, { status: 400 });
    }

    // Verify installation exists and is completed
    const installation = await db.installation.findUnique({
      where: { id: installationId },
      select: { id: true, status: true },
    });

    if (!installation) {
      return NextResponse.json({ error: "Installation not found" }, { status: 404 });
    }

    if (installation.status !== "COMPLETED") {
      return NextResponse.json({ error: "Feedback can only be submitted for completed installations" }, { status: 400 });
    }

    // Create feedback
    const customerFeedback = await db.customerFeedback.create({
      data: {
        installationId,
        rating: Number(rating),
        feedback: feedback || "",
      },
    });

    // Update technician rating (average)
    const inst = await db.installation.findUnique({
      where: { id: installationId },
      select: { technicianId: true },
    });

    if (inst) {
      const allFeedbacks = await db.customerFeedback.findMany({
        where: { Installation: { technicianId: inst.technicianId } },
        select: { rating: true },
      });
      const avgRating = allFeedbacks.length > 0
        ? Math.round((allFeedbacks.reduce((sum, f) => sum + f.rating, 0) / allFeedbacks.length) * 10) / 10
        : 0;
      await db.technician.update({
        where: { id: inst.technicianId },
        data: { rating: avgRating },
      });
    }

    return NextResponse.json({ feedback: customerFeedback }, { status: 201 });
  } catch (error: unknown) {
    console.error("Feedback POST error:", error);
    if (error && typeof error === "object" && "statusCode" in error) {
      const err = error as { statusCode: number; message: string };
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 });
  }
}

// GET /api/installations/feedback?installationId=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const installationId = searchParams.get("installationId");

    if (!installationId) {
      return NextResponse.json({ error: "Installation ID is required" }, { status: 400 });
    }

    const feedbacks = await db.customerFeedback.findMany({
      where: { installationId },
      orderBy: { createdAt: "desc" },
    });

    const avgRating = feedbacks.length > 0
      ? Math.round((feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length) * 10) / 10
      : null;

    return NextResponse.json({ feedbacks, avgRating, count: feedbacks.length });
  } catch (error) {
    console.error("Feedback GET error:", error);
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }
}
