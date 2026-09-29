import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function POST(request: Request) {
  try {
    const userId = await requireAuth(request as unknown as import("next/server").NextRequest);

    const body = await request.json();
    const { announcementId } = body;

    if (!announcementId) {
      return NextResponse.json({ error: "announcementId is required" }, { status: 400 });
    }

    // Verify announcement exists
    const announcement = await db.announcement.findUnique({ where: { id: announcementId } });
    if (!announcement) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }

    // Upsert dismissal record (idempotent)
    const dismissal = await db.announcementDismissal.upsert({
      where: {
        announcementId_userId: { announcementId, userId },
      },
      create: { announcementId, userId },
      update: {}, // No-op if already exists
    });

    return NextResponse.json({ success: true, dismissal });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Announcement dismiss error:", error);
    return NextResponse.json({ error: "Failed to dismiss announcement" }, { status: 500 });
  }
}
