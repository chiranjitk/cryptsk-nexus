import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

// GET /api/complaints/[id]/comments — Fetch all comments for a complaint
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const comments = await db.complaintComment.findMany({
      where: { complaintId: id },
      include: {
        User: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Complaint comments GET error:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

// POST /api/complaints/[id]/comments — Add a new comment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Comment message is required" }, { status: 400 });
    }

    // Verify complaint exists
    const complaint = await db.complaint.findUnique({ where: { id } });
    if (!complaint) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    const comment = await db.complaintComment.create({
      data: {
        complaintId: id,
        userId,
        message: message.trim(),
      },
      include: {
        User: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
      },
    });

    await auditLog(req, "COMMENT", "Complaint", id, {
      details: { commentId: comment.id, ticketNumber: complaint.ticketNumber, messagePreview: message.trim().substring(0, 100) },
      userId,
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    console.error("Complaint comments POST error:", error);
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
