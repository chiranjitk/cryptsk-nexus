import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/captive-portal/sessions/[id] — Get session detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(_req);
    const { id } = await params;

    const session = await db.portalSession.findUnique({
      where: { id },
      include: {
        portal: { select: { id: true, name: true, template: true, loginMethod: true } },
        Subscriber: { select: { id: true, name: true, code: true, phone: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      session: {
        ...session,
        downloadBytes: Number(session.downloadBytes),
        uploadBytes: Number(session.uploadBytes),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Sessions] GET [id] error:", error);
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}

// DELETE /api/captive-portal/sessions/[id] — Disconnect session
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(_req);
    const { id } = await params;

    const existing = await db.portalSession.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (existing.status !== "ACTIVE") {
      return NextResponse.json({ error: "Session is not active" }, { status: 400 });
    }

    const session = await db.portalSession.update({
      where: { id },
      data: {
        status: "ADMIN_DISCONNECT",
        disconnectReason: "Disconnected by administrator",
        lastActivity: new Date(),
      },
    });

    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Sessions] DELETE [id] error:", error);
    return NextResponse.json({ error: "Failed to disconnect session" }, { status: 500 });
  }
}
